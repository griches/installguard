import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Checked, Ecosystem, Entry, Flag, Held, Oddity, Request } from '../types'
import { assess, compact, registryName, summary } from './assess'
import type { Thresholds } from './assess'
import { findInstalls } from './detect'
import { lookup } from './registry'
import type { Get } from './registry'

const PANE = 'installguard'
const TITLE = 'Install Guard'
const COMMAND = 'installguard'
const ALLOWED_KEY = 'allowed'
const KEPT_ENTRIES = 30
const SHOWN_ENTRIES = 8
const MOST_PACKAGES = 12
/** What a registry accepts as a name: nothing that could reach outside the package's own address. */
const PACKAGE_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i
const USER_AGENT = 'installguard (https://github.com/griches/installguard)'

type Decision = 'install' | 'always' | 'cancel' | 'unanswered' | 'interrupted'

const ANSWER = { cancel: 'Cancel', install: 'Run it once', always: 'Run it and always allow' } as const

const SENSITIVITY: Record<string, Omit<Thresholds, 'holdsUnchecked'>> = {
  relaxed: { minAgeDays: 7, cooldownDays: 1, minWeeklyDownloads: 100 },
  balanced: { minAgeDays: 30, cooldownDays: 3, minWeeklyDownloads: 1000 },
  strict: { minAgeDays: 90, cooldownDays: 7, minWeeklyDownloads: 10_000 },
}
const ECOSYSTEMS: readonly Ecosystem[] = ['npm', 'pypi', 'crates', 'rubygems']
const ODDITY: Record<Oddity['kind'], (detail: string) => string> = {
  'pipe-to-shell': detail => `runs a script downloaded from ${detail} without showing it`,
  'remote-source': detail => `installs from ${detail}, which no registry vouches for`,
  tap: detail => `installs from the third-party tap ${detail}`,
  unreadable: detail => `names its package through a shell variable, so \`${detail}\` could not be checked`,
}

const held = atom({ plugin: 'installguard', key: 'held' } as const, null)
const log = atom({ plugin: 'installguard', key: 'log' } as const, [])
const allowed = atom({ plugin: 'installguard', key: 'allowed' } as const, [])

const keyOf = (one: Pick<Request, 'ecosystem' | 'name'>) => `${one.ecosystem}:${one.name}`

const isRisky = (one: Checked) => one.flags.some(flag => flag.level === 'risk')

const titled = (one: Request) => (one.version === null ? one.name : `${one.name}@${one.version}`)

const record = ($: EngineInterface, entry: Entry) => update($, log, list => [...list, entry].slice(-KEPT_ENTRIES))

/** What is wrong with a held command, in words Claude can act on. */
const told = (flag: Flag) => `${flag.label.toLowerCase()}, ${flag.text}`

const reasons = (packages: readonly Checked[], oddities: readonly Oddity[]) => [
  ...packages.filter(isRisky).map(one => `${titled(one)} (${registryName(one.ecosystem)}): ${one.flags.filter(flag => flag.level === 'risk').map(told).join('; ')}`),
  ...oddities.map(one => `${one.via} ${ODDITY[one.kind](one.detail)}`),
]

/** The dialog's chip: the kind of concern in a word or two, twelve characters at most. */
const CHIP: Record<Flag['kind'], string> = {
  missing: 'Unknown pkg',
  typosquat: 'Typosquat?',
  new: 'New package',
  fresh: 'New release',
  undated: 'Undated',
  unpopular: 'Little used',
  unchecked: 'Unchecked',
  deprecated: 'Deprecated',
  script: 'Install',
  'source-only': 'Install',
}
const ODDITY_LABEL: Record<Oddity['kind'], string> = {
  'pipe-to-shell': 'Downloaded script',
  'remote-source': 'Outside a registry',
  tap: 'Third-party tap',
  unreadable: 'Unreadable name',
}

/** The first concern of a held command: what the heading and the dialog's chip name. */
const concern = (packages: readonly Checked[], oddities: readonly Oddity[]) => {
  const flag = packages.flatMap(one => one.flags).find(one => one.level === 'risk')
  const [oddity] = oddities

  if (flag !== undefined) {
    return { label: flag.label, chip: CHIP[flag.kind] }
  }

  return oddity === undefined ? { label: 'New package', chip: 'Install' } : { label: ODDITY_LABEL[oddity.kind], chip: oddity.kind === 'pipe-to-shell' ? 'Remote code' : 'Install' }
}

const pypiName = (name: string) => name.toLowerCase().replace(/[-_.]+/g, '-')

/** The lines of a TOML file that stand under a table whose header matches. */
const tables = (toml: string, header: RegExp) => {
  const lines: string[] = []
  let isInside = false

  for (const line of toml.split('\n').map(one => one.trim())) {
    if (line.startsWith('[')) {
      isInside = header.test(line)
    } else if (isInside && line !== '' && !line.startsWith('#')) {
      lines.push(line)
    }
  }

  return lines
}

/** The names a project already depends on, read from its own manifests: asking for one of them again is no news. */
const declared = async ($: EngineInterface, cwd: string): Promise<Set<string>> => {
  const names = new Set<string>()
  const file = (name: string) => $.fs.read(`${cwd}/${name}`).catch(() => '')
  const [manifest, requirements, pyproject, cargo, gemfile] = await Promise.all([
    file('package.json'),
    file('requirements.txt'),
    file('pyproject.toml'),
    file('Cargo.toml'),
    file('Gemfile'),
  ])

  try {
    const parsed = JSON.parse(manifest) as Record<string, Record<string, string> | undefined>

    for (const group of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      Object.keys(parsed[group] ?? {}).forEach(name => names.add(`npm:${name.toLowerCase()}`))
    }
  } catch {
    // no package.json, or not JSON
  }

  for (const found of requirements.matchAll(/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:[=~<>!;#]|$)/gm)) {
    names.add(`pypi:${pypiName(found[1] ?? '')}`)
  }

  // PEP 621 lists requirements as strings; Poetry keys them under its own tables.
  for (const block of pyproject.matchAll(/dependencies\s*=\s*\[([^\]]*)\]/g)) {
    for (const found of (block[1] ?? '').matchAll(/["']\s*([A-Za-z0-9][A-Za-z0-9._-]*)/g)) {
      names.add(`pypi:${pypiName(found[1] ?? '')}`)
    }
  }

  for (const line of tables(pyproject, /^\[tool\.poetry\.(?:group\.[\w-]+\.)?(?:dev-)?dependencies\]$/)) {
    names.add(`pypi:${pypiName(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/.exec(line)?.[1] ?? '')}`)
  }

  for (const line of tables(cargo, /^\[(?:workspace\.)?(?:dev-|build-)?dependencies\]$/)) {
    names.add(`crates:${(/^([A-Za-z0-9][A-Za-z0-9_-]*)\s*=/.exec(line)?.[1] ?? '').toLowerCase()}`)
  }

  for (const found of gemfile.matchAll(/^\s*gem\s+["']([^"']+)["']/gm)) {
    names.add(`rubygems:${(found[1] ?? '').toLowerCase()}`)
  }

  return names
}

/**
 * Asks a registry about a package. Every request the mod makes is made here, to one of
 * six fixed public hosts, and carries nothing but the package's name in its address.
 */
const get =
  ($: EngineInterface): Get =>
  async url => {
    const init = { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } }
    const rest = url.slice(url.indexOf('/', 8) + 1)

    try {
      let answered

      if (url.startsWith('https://registry.npmjs.org/')) {
        answered = await $.http.fetch(`https://registry.npmjs.org/${rest}`, init)
      } else if (url.startsWith('https://api.npmjs.org/')) {
        answered = await $.http.fetch(`https://api.npmjs.org/${rest}`, init)
      } else if (url.startsWith('https://pypi.org/')) {
        answered = await $.http.fetch(`https://pypi.org/${rest}`, init)
      } else if (url.startsWith('https://pypistats.org/')) {
        answered = await $.http.fetch(`https://pypistats.org/${rest}`, init)
      } else if (url.startsWith('https://crates.io/')) {
        answered = await $.http.fetch(`https://crates.io/${rest}`, init)
      } else if (url.startsWith('https://rubygems.org/')) {
        answered = await $.http.fetch(`https://rubygems.org/${rest}`, init)
      } else {
        return null
      }

      return { status: answered.status, text: answered.text }
    } catch {
      return null
    }
  }

const check = async ($: EngineInterface, requests: readonly Request[], thresholds: Thresholds): Promise<Checked[]> => {
  const at = await $.clock.now()
  const fetch = get($)

  return Promise.all(
    requests.map(async request => {
      const facts = await lookup(fetch, request)
      const flags = assess(request, facts, thresholds, at)
      // A deprecated package that is about to be run, not only stored, is worth a look.
      const raised = flags.map(flag => (flag.kind === 'deprecated' && request.isExecuted ? { ...flag, level: 'risk' as const } : flag))
      const near = raised.find(flag => flag.near !== undefined)?.near

      if (near === undefined) {
        return { ...request, facts, flags: raised, lookalike: null }
      }

      // The package it looks like is asked about too, so both can be shown side by side.
      const known = await lookup(fetch, { ...request, name: near, version: null })
      const weekly = known.isFound ? known.weeklyDownloads : null
      const used = weekly === null ? '' : ` (${compact(weekly)} downloads a week)`

      return {
        ...request,
        facts,
        flags: raised.map(flag => (flag.kind === 'typosquat' ? { ...flag, text: `looks like ${near}${used}, which is a different package` } : flag)),
        lookalike: { name: near, weeklyDownloads: weekly },
      }
    }),
  )
}

const allow = async ($: EngineInterface, keys: readonly string[]) => {
  const all = [...new Set([...(await read($, allowed)), ...keys])].sort()
  await update($, allowed, () => all)
  await $.store.set(ALLOWED_KEY, all).catch(() => undefined)
}

/** The held command's report, drawn in the pane while the question is up. */
const report = ($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], holding: Held, at: number) => {
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column">
      <Text bold color="warning">{`Held before it runs: ${concern(holding.packages, holding.oddities).label.toLowerCase()}`}</Text>
      <Text dimColor wrap="truncate-end">{`$ ${holding.command.replace(/\s+/g, ' ')}`}</Text>
      {holding.packages.map(one => (
        <Box flexDirection="column" marginTop={1}>
          <Box flexDirection="row">
            <Text bold color={isRisky(one) ? 'warning' : 'success'}>{`${isRisky(one) ? '!' : '✓'} `}</Text>
            <Text bold>{one.facts.isFound ? summary(one, one.facts, at) : titled(one)}</Text>
            <Text dimColor>{`  ${registryName(one.ecosystem)} · ${one.via}`}</Text>
          </Box>
          {one.flags.map(flag => (
            <Box flexDirection="column">
              <Text bold color={flag.level === 'risk' ? 'warning' : undefined} dimColor={flag.level === 'note'}>{`    ${flag.label}`}</Text>
              <Box flexDirection="row">
                <Box width={6} flexShrink={0}>
                  <Text> </Text>
                </Box>
                <Box flexGrow={1} flexShrink={1}>
                  <Text color={flag.level === 'risk' ? 'warning' : undefined} dimColor={flag.level === 'note'}>{flag.text}</Text>
                </Box>
              </Box>
            </Box>
          ))}
          {one.lookalike !== null && (
            <Box flexDirection="column" marginTop={1}>
              <Text>{`    You asked for  ${titled(one)}${one.facts.weeklyDownloads === null ? '' : ` · ${compact(one.facts.weeklyDownloads)} a week`}`}</Text>
              <Text color="success">{`    You may mean   ${one.lookalike.name}${one.lookalike.weeklyDownloads === null ? '' : ` · ${compact(one.lookalike.weeklyDownloads)} a week`}`}</Text>
            </Box>
          )}
        </Box>
      ))}
      {holding.oddities.map(one => (
        <Box flexDirection="row" marginTop={1}>
          <Text bold color="warning">{'! '}</Text>
          <Text>{`${one.via} ${ODDITY[one.kind](one.detail)}`}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>Answer the question to run or cancel it.</Text>
      </Box>
    </Box>
  )
}

/** The question the dialog asks: what was flagged, then the command. */
const question = (command: string, flagged: readonly string[], asked: number, lead: string) => {
  const shown = flagged.slice(0, 4)
  const rest = flagged.length > shown.length ? ` (+${flagged.length - shown.length} more in the pane)` : ''
  const what = shown.length === 0 ? `${asked} new package${asked === 1 ? '' : 's'} this project does not have yet` : shown.join(' | ')
  const line = command.replace(/\s+/g, ' ').trim()

  return `${lead}: ${what}${rest}. Run \`${line.length > 120 ? `${line.slice(0, 120)}…` : line}\`?`
}

export const register: Register = (on, options) => {
  const holdsAll = options.hold === 'always'
  const thresholds: Thresholds = {
    ...(SENSITIVITY[String(options.sensitivity)] ?? SENSITIVITY.balanced ?? { minAgeDays: 30, cooldownDays: 3, minWeeklyDownloads: 1000 }),
    holdsUnchecked: options.unreachable === 'hold',
  }
  const wantsToasts = options.toasts !== false
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show what Install Guard checked (check <name>: look a package up; allow <name>: always allow it; forget: clear the allowed list)',
      argumentHint: '[check|allow <package>] [forget]',
    })
    const kept = await $.store.get(ALLOWED_KEY).catch(() => undefined)
    await update($, allowed, () => (Array.isArray(kept) ? kept.filter(one => typeof one === 'string') : []))

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const named = rest.join(' ')
    const [prefix, bare] = named.includes(':') ? [named.slice(0, named.indexOf(':')), named.slice(named.indexOf(':') + 1)] : ['npm', named]
    const ecosystem = ECOSYSTEMS.find(one => one === prefix) ?? 'npm'

    if (verb === 'forget') {
      await update($, allowed, () => [])
      await $.store.delete(ALLOWED_KEY).catch(() => undefined)

      return { text: 'Install Guard: the allowed list is empty again.' }
    }

    if ((verb === 'allow' || verb === 'check') && bare !== '' && !PACKAGE_NAME.test(bare)) {
      return { text: `Install Guard: "${bare.slice(0, 80)}" is not a package name.` }
    }

    if ((verb === 'allow' || verb === 'check') && bare === '') {
      return { text: `Install Guard: name a package, as in /${COMMAND} ${verb} left-pad or /${COMMAND} ${verb} pypi:requests.` }
    }

    if (verb === 'allow') {
      await allow($, [`${ecosystem}:${bare.toLowerCase()}`])

      return { text: `Install Guard: ${bare} (${registryName(ecosystem)}) is always allowed from now on.` }
    }

    if (verb === 'check') {
      const [one] = await check($, [{ ecosystem, name: bare.toLowerCase(), version: null, via: 'check', isExecuted: false }], thresholds)

      if (one === undefined) {
        return { text: 'Install Guard: nothing to check.' }
      }

      const told = one.flags.length === 0 ? ['nothing flagged'] : one.flags.map(flag => `${flag.level === 'risk' ? '!' : '·'} ${flag.label}: ${flag.text}`)

      return { text: [`${summary(one, one.facts, await $.clock.now())} (${registryName(ecosystem)})`, ...told.map(line => `  ${line}`)].join('\n') }
    }

    await $.ui.open({ id: PANE, title: TITLE })
    const entries = await read($, log)

    return {
      text:
        entries.length === 0
          ? 'Install Guard pane opened. Nothing checked yet in this session.'
          : `Install Guard pane opened. ${entries.reduce((total, one) => total + one.packages.length, 0)} packages checked in this session.`,
    }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const found = findInstalls(e.command)

    if (found.requests.length === 0 && found.oddities.length === 0) {
      return next(e)
    }

    const cwd = await $.session.cwd().catch(() => '')
    const [known, trusted] = await Promise.all([declared($, cwd), read($, allowed)])
    const isLocal = async (one: Request) =>
      one.isExecuted && one.ecosystem === 'npm' && cwd !== '' && (await $.fs.exists(`${cwd}/node_modules/.bin/${one.name}`).catch(() => false))
    const fresh: Request[] = []

    for (const one of found.requests) {
      if (!trusted.includes(keyOf(one)) && !known.has(keyOf(one)) && !(await isLocal(one))) {
        fresh.push(one)
      }
    }

    if (fresh.length === 0 && found.oddities.length === 0) {
      return next(e)
    }

    const packages = await check($, fresh.slice(0, MOST_PACKAGES), thresholds)
    const at = await $.clock.now()
    const mustHold = holdsAll || found.oddities.length > 0 || packages.some(isRisky) || fresh.length > MOST_PACKAGES

    if (!mustHold) {
      await record($, { at, outcome: 'passed', packages, oddities: [] })

      if (wantsToasts) {
        $.ui.toast(packages.length === 1 && packages[0] !== undefined ? `✓ ${summary(packages[0], packages[0].facts, at)}` : `✓ ${packages.length} packages checked, nothing flagged`)
      }

      return next(e)
    }

    const id = e.tool_use_id
    const flagged = reasons(packages, found.oddities)
    const canAlways = packages.length > 0 && found.oddities.length === 0
    let decision: Decision = 'cancel'
    let said = ''

    await update($, held, () => ({ id, command: e.command, packages, oddities: found.oddities }))
    // The pane holds the whole report beside the question; where it is not placed the question says enough.
    void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)

    try {
      const first = concern(packages, found.oddities)
      const answered = await $.ui.ask(question(e.command, flagged, fresh.length, 'Install Guard'), {
        header: flagged.length === 0 ? 'Install' : first.chip,
        options: canAlways ? [ANSWER.cancel, ANSWER.install, ANSWER.always] : [ANSWER.cancel, ANSWER.install],
      })

      if (answered === ANSWER.install) {
        decision = 'install'
      } else if (answered === ANSWER.always && canAlways) {
        decision = 'always'
      } else if (answered !== ANSWER.cancel) {
        // Words typed under Other are for Claude: the command is refused and they are passed on.
        said = answered.trim()
      }
    } catch {
      // Dismissed, or nobody to ask (a `-p` run): a flagged command is not run unanswered.
      decision = next.signal.aborted ? 'interrupted' : 'unanswered'
    } finally {
      await update($, held, current => (current?.id === id ? null : current)).catch(() => undefined)
    }

    const outcome = decision === 'install' || decision === 'always' ? 'installed' : decision === 'cancel' ? 'cancelled' : 'unanswered'
    await record($, { at, outcome, packages, oddities: found.oddities })

    if (decision === 'always') {
      await allow($, packages.map(keyOf))
    }

    if (outcome === 'installed') {
      return next(e)
    }

    const told: Partial<Record<Decision, string>> = {
      cancel: said === '' ? 'the user chose Cancel' : `the user answered: "${said}"`,
      unanswered: 'the question was dismissed, or nobody was there to answer it',
      interrupted: 'the turn was interrupted',
    }
    const over = fresh.length > MOST_PACKAGES ? [`it names ${fresh.length} new packages at once, more than are checked in one go`] : []

    return {
      deny: `Install Guard held this command and did not run it: ${told[decision] ?? 'it was not approved'}. Flagged: ${[...flagged, ...over].join(' | ') || 'every new package is held for approval'}. Do not retry it or reach the same package another way unless the user asks you to; say what was flagged and offer an established alternative if there is one.`,
    }
  }).catch(($, e, next) => {
    if (next.called) {
      return next(e)
    }

    // The guard failed: a command that fetches nothing new goes on, one that does is refused.
    const found = findInstalls(e.command)

    return found.requests.length === 0 && found.oddities.length === 0
      ? next(e)
      : { deny: 'Install Guard failed while checking this command, so it was not run. Ask the user before retrying it.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const holding = await read($, held)
    const at = await $.clock.now()

    if (holding !== null) {
      return report($, e, holding, at)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const entries = (await read($, log)).slice(-SHOWN_ENTRIES).reverse()
    const always = await read($, allowed)
    const GLYPH = { passed: '✓', installed: '✓', cancelled: '✗', unanswered: '◌' } as const
    const TONE = { passed: 'success', installed: 'warning', cancelled: 'error', unanswered: undefined } as const
    const WORD = { passed: 'nothing flagged', installed: 'flagged, run anyway', cancelled: 'flagged, cancelled', unanswered: 'flagged, not answered' } as const

    return (
      <Box flexDirection="column">
        {entries.length === 0 && (
          <Box flexDirection="column">
            <Text dimColor>Nothing checked yet.</Text>
            <Text dimColor>New packages from npm, PyPI, crates.io and RubyGems are looked up before they install.</Text>
          </Box>
        )}
        {entries.map(entry => (
          <Box flexDirection="column" marginBottom={1}>
            <Box flexDirection="row">
              <Text bold color={TONE[entry.outcome]}>{`${GLYPH[entry.outcome]} `}</Text>
              <Text dimColor>{WORD[entry.outcome]}</Text>
            </Box>
            {entry.packages.map(one => (
              <Box flexDirection="column">
                <Text>{`  ${one.facts.isFound ? summary(one, one.facts, at) : titled(one)}`}</Text>
                {one.flags.filter(flag => flag.level === 'risk').map(flag => (
                  <Text color="warning">{`    ${flag.label}: ${flag.text}`}</Text>
                ))}
              </Box>
            ))}
            {entry.oddities.map(one => (
              <Text color="warning">{`  ${one.via} ${ODDITY[one.kind](one.detail)}`}</Text>
            ))}
          </Box>
        ))}
        <Text dimColor>{always.length === 0 ? 'No package is always allowed.' : `Always allowed: ${always.map(one => one.slice(one.indexOf(':') + 1)).join(', ')}`}</Text>
        {always.length > 0 && (
          <Box marginTop={1}>
            <Button
              key="forget"
              hotkey="f"
              plain
              label="Forget the allowed list"
              onPress={async () => {
                await update($, allowed, () => [])
                await $.store.delete(ALLOWED_KEY).catch(() => undefined)
              }}
            />
          </Box>
        )}
      </Box>
    )
  })
}
