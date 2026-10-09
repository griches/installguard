import type { Ecosystem, Oddity, Request } from '../types'
import { commands } from './shell'

export type Found = { requests: Request[]; oddities: Oddity[] }

type Rule = {
  ecosystem: Ecosystem
  /** Flags that take the next argument as their value, which is then no package. */
  valued: ReadonlySet<string>
  /** Flags whose value is itself a package to fetch. */
  naming?: ReadonlySet<string>
  /** Flags that make every package of the command a local or remote source. */
  local?: ReadonlySet<string>
  isExecuted?: true
  /** Only the first argument is a package: the rest belong to the program it runs. */
  isFirstOnly?: true
}

const NPM_VALUED = new Set(['--prefix', '--registry', '-w', '--workspace', '--tag', '--cache', '--userconfig', '-C', '--dir', '--filter', '-F', '--cwd'])
const PIP_VALUED = new Set([
  '-r', '--requirement', '-c', '--constraint', '-e', '--editable', '-i', '--index-url', '--extra-index-url', '-t', '--target',
  '--python', '-p', '-f', '--find-links', '--prefix', '--root', '--group', '--extra', '--optional', '--index', '--platform',
  '--python-version', '--implementation', '--abi', '--src', '--upgrade-strategy', '--config-settings', '--cache-dir', '--directory', '--project',
])
const CARGO_VALUED = new Set([
  '--features', '-F', '--rename', '--package', '-p', '--manifest-path', '--registry', '--branch', '--tag', '--rev', '--version', '--vers',
  '--root', '--bin', '--example', '--profile', '--target', '--target-dir', '--index', '-j', '--jobs', '--config', '-Z',
])
const GEM_VALUED = new Set(['-v', '--version', '-i', '--install-dir', '-n', '--bindir', '-P', '--trust-policy', '--platform', '-g', '--file'])

const NPM: Rule = { ecosystem: 'npm', valued: NPM_VALUED }
const NPX: Rule = { ecosystem: 'npm', valued: new Set([...NPM_VALUED, '-c', '--call']), naming: new Set(['-p', '--package']), isExecuted: true, isFirstOnly: true }
const PIP: Rule = { ecosystem: 'pypi', valued: PIP_VALUED }
const UVX: Rule = { ecosystem: 'pypi', valued: PIP_VALUED, naming: new Set(['--from', '--with']), isExecuted: true, isFirstOnly: true }
const CARGO: Rule = { ecosystem: 'crates', valued: CARGO_VALUED, local: new Set(['--path', '--git']) }
const GEM: Rule = { ecosystem: 'rubygems', valued: GEM_VALUED, local: new Set(['--local', '-l']) }

/** The verbs of each program that fetch packages named on the command line. */
const VERBS: Record<string, Record<string, Rule>> = {
  npm: { install: NPM, i: NPM, add: NPM, in: NPM, ins: NPM, inst: NPM, isntall: NPM, exec: NPX, x: NPX },
  pnpm: { add: NPM, install: NPM, i: NPM, dlx: NPX },
  yarn: { add: NPM, dlx: NPX },
  bun: { add: NPM, install: NPM, i: NPM, a: NPM, x: NPX },
  pip: { install: PIP },
  pipx: { install: PIP, run: UVX, inject: PIP },
  poetry: { add: PIP },
  pdm: { add: PIP },
  uv: { add: PIP },
  cargo: { add: CARGO, install: CARGO, binstall: CARGO },
  gem: { install: GEM, i: GEM },
}
const DIRECT: Record<string, Rule> = { npx: NPX, bunx: NPX, pnpx: NPX, uvx: UVX }
const NEVER_FETCHES = new Set(['--no-install', '--no', '--offline', '--dry-run', '--help', '-h'])
const NPM_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i
const NPM_REMOTE = /^(?:git\+|git:|git@|https?:|github:|gitlab:|bitbucket:|gist:)/i
const NPM_SHORTHAND = /^[\w.-]+\/[\w.-]+(?:#.+)?$/
const LOCAL = /^(?:\.|\/|~|file:|link:|workspace:|portal:|[A-Za-z]:[\\/])/
const ARCHIVE = /\.(?:whl|tar\.gz|tgz|zip|gem|crate)$/i
const PYPI_SPEC = /^([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)(?:\[[^\]]*\])?\s*(?:(===?|~=|>=|<=|!=|>|<)\s*([^,;\s]+))?/
const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const URL = /https?:\/\/[^\s"'|)<>]+/
const INTERPRETER = String.raw`(?:(?:ba|z|da|k|fi)?sh|python[\d.]*|node|perl|ruby)\b`
const PIPED = new RegExp(String.raw`\b(?:curl|wget)\b[^|;&\n]*\|\s*(?:sudo\s+(?:-\S+\s+)*)?${INTERPRETER}`)
const SUBSTITUTED = new RegExp(String.raw`\b(?:${INTERPRETER}\s+(?:-\w+\s+)*<\(\s*|${INTERPRETER}\s+-c\s+["']?\$\(\s*|eval\s+["']?\$\(\s*)(?:curl|wget)\b`)

const PUBLIC_HOSTS = new Set(['registry.npmjs.org', 'pypi.org', 'crates.io', 'rubygems.org'])

const host = (url: string) => /^https?:\/\/([^/\s:]+)/.exec(url)?.[1] ?? url

/** A command line with what stands inside quotes taken out, so quoted text is not read as a pipeline. */
const unquoted = (command: string) => command.replace(/'[^']*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')

const npmSpec = (spec: string, via: string, isExecuted: boolean): Request | Oddity | null => {
  if (LOCAL.test(spec) || ARCHIVE.test(spec)) {
    return null
  }

  if (NPM_REMOTE.test(spec) || (!spec.startsWith('@') && NPM_SHORTHAND.test(spec))) {
    return { kind: 'remote-source', detail: spec, via }
  }

  // `alias@npm:real@1.2.3` installs `real`.
  const real = spec.includes('@npm:') ? spec.slice(spec.indexOf('@npm:') + 5) : spec
  const at = real.lastIndexOf('@')
  const name = at > 0 ? real.slice(0, at) : real
  const version = at > 0 ? real.slice(at + 1) : null

  return NPM_NAME.test(name)
    ? { ecosystem: 'npm', name: name.toLowerCase(), version: version !== null && /^\d/.test(version) ? version : null, via, isExecuted }
    : null
}

const pypiSpec = (spec: string, via: string, isExecuted: boolean): Request | Oddity | null => {
  if (LOCAL.test(spec) || ARCHIVE.test(spec)) {
    return null
  }

  if (/^(?:git\+|hg\+|svn\+|bzr\+|https?:)/i.test(spec) || /\s@\s|@(?:git\+|https?:)/.test(spec)) {
    return { kind: 'remote-source', detail: spec, via }
  }

  const found = PYPI_SPEC.exec(spec)
  // `uvx ruff@0.6.0` pins with an at sign.
  const pinned = /^([A-Za-z0-9][A-Za-z0-9._-]*)@(\d[^\s]*)$/.exec(spec)
  const name = pinned?.[1] ?? found?.[1]

  if (name === undefined) {
    return null
  }

  return {
    ecosystem: 'pypi',
    name: name.toLowerCase().replace(/[-_.]+/g, '-'),
    version: pinned?.[2] ?? (found?.[2] === '==' ? (found[3] ?? null) : null),
    via,
    isExecuted,
  }
}

const plainSpec = (ecosystem: Ecosystem) => (spec: string, via: string, isExecuted: boolean): Request | Oddity | null => {
  if (LOCAL.test(spec) || ARCHIVE.test(spec)) {
    return null
  }

  const [name = '', version] = spec.split('@')

  return PLAIN_NAME.test(name) ? { ecosystem, name: name.toLowerCase(), version: version !== undefined && /^\d/.test(version) ? version : null, via, isExecuted } : null
}

const SPEC = { npm: npmSpec, pypi: pypiSpec, crates: plainSpec('crates'), rubygems: plainSpec('rubygems') }

const read = (rule: Rule, args: readonly string[], via: string, found: Found) => {
  if (args.some(one => NEVER_FETCHES.has(one))) {
    return
  }

  const specs: string[] = []
  let positional = 0

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? ''
    const [flag = '', inline] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg]

    if (arg === '--') {
      break
    }

    if (rule.local?.has(flag) === true) {
      if (flag === '--git' || flag === '--source') {
        found.oddities.push({ kind: 'remote-source', detail: inline ?? args[i + 1] ?? flag, via })
      }

      return
    }

    if (rule.naming?.has(flag) === true) {
      specs.push(inline ?? args[i + 1] ?? '')
      i += inline === undefined ? 1 : 0
      // `uvx --from pkg tool`: the positional argument is then a program, not a package.
      positional += flag === '--from' || flag === '-p' || flag === '--package' ? 1 : 0
    } else if (arg.startsWith('-')) {
      const isIndex = (flag === '--extra-index-url' || flag === '--index-url' || flag === '-i') && rule.ecosystem === 'pypi'
      const isRegistry = flag === '--registry' && (rule.ecosystem === 'npm' || rule.ecosystem === 'crates')
      const named = host(inline ?? args[i + 1] ?? '')

      // A registry other than the public one is not the one that gets looked up.
      if ((isIndex || isRegistry) && !PUBLIC_HOSTS.has(named)) {
        found.oddities.push({ kind: 'remote-source', detail: `${isIndex ? 'index' : 'registry'} ${named}`, via })
      }

      i += inline === undefined && rule.valued.has(flag) ? 1 : 0
    } else {
      if (rule.isFirstOnly !== true || positional === 0) {
        specs.push(arg)
      }

      positional += 1

      if (rule.isFirstOnly === true) {
        break
      }
    }
  }

  for (const spec of specs.filter(one => one !== '')) {
    const one = SPEC[rule.ecosystem](spec, via, rule.isExecuted === true)

    if (one !== null && 'kind' in one) {
      found.oddities.push(one)
    } else if (one !== null && !found.requests.some(other => other.ecosystem === one.ecosystem && other.name === one.name)) {
      found.requests.push(one)
    }
  }
}

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish'])
const VALUED_BEFORE_VERB = new Set([...NPM_VALUED, ...CARGO_VALUED, '--python', '--directory', '--project', '--cache-dir', '--color', '--config-file'])
const MOST_NESTED = 3

/** Where a program's verb stands among its arguments, the flags before it and their values passed over. */
const verbAt = (args: readonly string[], from = 0) => {
  for (let i = from; i < args.length; i += 1) {
    const arg = args[i] ?? ''

    if (arg.startsWith('-')) {
      i += !arg.includes('=') && VALUED_BEFORE_VERB.has(arg) ? 1 : 0
    } else if (!arg.startsWith('+')) {
      return i
    }
  }

  return -1
}

const scan = (command: string, found: Found, depth: number) => {
  for (const one of commands(command)) {
    const at = verbAt(one.args)
    const verb = at < 0 ? undefined : one.args[at]
    const rest = at < 0 ? [] : one.args.slice(at + 1)
    const secondAt = verbAt(rest)
    const second = secondAt < 0 ? undefined : rest[secondAt]
    const after = secondAt < 0 ? [] : rest.slice(secondAt + 1)
    const name = /^pip[\d.]*$/.test(one.name) ? 'pip' : one.name
    const isPip = /^python[\d.]*$/.test(name) && one.args[0] === '-m' && one.args[1] === 'pip' && one.args[2] === 'install'
    const fetches =
      DIRECT[name] !== undefined ||
      isPip ||
      (verb !== undefined && VERBS[name]?.[verb] !== undefined) ||
      (name === 'uv' && (verb === 'pip' || verb === 'tool')) ||
      (name === 'yarn' && verb === 'global')

    // A script handed to a shell or to eval runs too: it is read as a command line of its own.
    if (depth < MOST_NESTED && (name === 'eval' || (SHELLS.has(name) && one.args.includes('-c')))) {
      const script = name === 'eval' ? one.args.join(' ') : (one.args[one.args.indexOf('-c') + 1] ?? '')
      scan(script, found, depth + 1)
    } else if (one.hasDynamicArgs && fetches) {
      found.oddities.push({ kind: 'unreadable', detail: `${name}${verb === undefined ? '' : ` ${verb}`}`, via: name })
    } else if (DIRECT[name] !== undefined) {
      read(DIRECT[name], one.args, name, found)
    } else if (isPip) {
      read(PIP, one.args.slice(3), 'pip install', found)
    } else if (name === 'uv' && verb === 'pip' && second === 'install') {
      read(PIP, after, 'uv pip install', found)
    } else if (name === 'uv' && verb === 'tool' && (second === 'install' || second === 'run')) {
      read(second === 'run' ? UVX : PIP, after, `uv tool ${second}`, found)
    } else if (name === 'yarn' && verb === 'global' && second === 'add') {
      read(NPM, after, 'yarn global add', found)
    } else if (name === 'brew' && (verb === 'install' || verb === 'reinstall' || verb === 'tap')) {
      for (const formula of rest.filter(arg => !arg.startsWith('-'))) {
        const parts = formula.split('/')
        const isForeign = verb === 'tap' ? parts.length === 2 : parts.length === 3

        if (isForeign && parts[0]?.toLowerCase() !== 'homebrew') {
          found.oddities.push({ kind: 'tap', detail: formula, via: `brew ${verb}` })
        }
      }
    } else if (verb !== undefined && VERBS[name]?.[verb] !== undefined) {
      read(VERBS[name][verb], rest, `${name} ${verb}`, found)
    }
  }
}

/**
 * The packages a Bash command would fetch from a registry, and what it would
 * fetch from anywhere else: a script piped into a shell, a git URL, a tap.
 *
 * A bare `npm install` or `pip install -r requirements.txt` asks for nothing
 * by name, so it is not listed: the lockfile or the file is the project's own.
 */
export const findInstalls = (command: string): Found => {
  const found: Found = { requests: [], oddities: [] }
  const plain = unquoted(command)

  if (PIPED.test(plain) || SUBSTITUTED.test(command)) {
    const url = URL.exec(command)?.[0]
    found.oddities.push({ kind: 'pipe-to-shell', detail: url === undefined ? 'a downloaded script' : host(url), via: 'curl | sh' })
  }

  scan(command, found, 0)

  return found
}
