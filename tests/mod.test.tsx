import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { NOW, WEB } from './fixtures'

const PLUGIN = 'installguard'
const SURFACES = ['terminal', 'desktop'] as const
const PANE = {
  plugin: PLUGIN,
  component: 'Pane',
  requestId: 'installguard',
  props: {
    title: 'Install Guard',
    isFocused: true,
    bodyColumns: 70,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
  viewport: { columns: 160, rows: 40 },
} as const
type World = {
  /** Files of the project, by path under `/work`. */
  files?: Record<string, string>
  /** What the person picks in the question dialog, one per question; `null` dismisses it. */
  answers?: (string | null)[]
  /** Runs while the question is up, before it is answered. */
  whileAsked?: () => Promise<void>
  stored?: Record<string, unknown>
}

/** Runs the mod's slash command as typed at the prompt. */
const slash = ($: Engine, args: string) => $.command.run({ command: PLUGIN, args } as never) as Promise<{ text?: string }>

const world = (on: On, { files = {}, answers = [], whileAsked, stored = {} }: World = {}) => {
  const seen = {
    ran: [] as string[],
    fetched: [] as string[],
    toasts: [] as string[],
    statuses: [] as (string | undefined)[],
    opened: [] as string[],
    asked: [] as { question: string; header: string; options: string[] }[],
    store: { ...stored } as Record<string, unknown>,
  }
  mock.clock(on, { now: NOW })
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/work' }))
  on('store.get', (_$, e) => ({ value: seen.store[e.key] }))
  on('store.set', (_$, e) => {
    seen.store[e.key] = e.value

    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    delete seen.store[e.key]

    return { value: undefined }
  })
  on('fs.read', (_$, e) => {
    const text = files[e.path.replace('/work/', '')]

    if (text === undefined) {
      throw new Error('ENOENT')
    }

    return { value: text }
  })
  on('fs.exists', (_$, e) => ({ value: files[e.path.replace('/work/', '')] !== undefined }))
  on('http.fetch', (_$, e) => {
    seen.fetched.push(e.url)
    const answer = WEB[e.url]

    if (answer === undefined) {
      throw new Error('ENOTFOUND')
    }

    return { value: { ...answer, ok: answer.status === 200, headers: {} } }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, async (_$, e) => {
    const [one] = e.questions
    await whileAsked?.()
    const picked = answers.shift()
    seen.asked.push({ question: one?.question ?? '', header: one?.header ?? '', options: (one?.options ?? []).map(option => option.label) })

    if (picked === undefined || picked === null) {
      throw new Error('dismissed')
    }

    return { result: { questions: e.questions, answers: { [one?.question ?? '']: picked } }, text: picked }
  })
  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    seen.ran.push(e.command)

    return { result: { stdout: 'done', stderr: '', interrupted: false }, text: 'done' }
  })
  on('ui.open', (_$, e) => {
    seen.opened.push(e.id)

    return { value: { isPlaced: true as const } }
  })
  on('ui.status', (_$, e) => {
    seen.statuses.push(e.text)

    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    seen.toasts.push(e.text)

    return { value: undefined }
  })

  return seen
}

const bash = ($: Engine, command: string, id = 'toolu_1') => $.tool.call({ tool: 'Bash', command, tool_use_id: id })

test('an established package installs with a toast and no question', async ($, on) => {
  const seen = world(on)

  const ran = await bash($, 'npm install express')

  expect(ran.deny).toBeUndefined()
  expect(seen.ran).toEqual(['npm install express'])
  expect(seen.opened).toEqual([])
  expect(seen.toasts).toEqual(['✓ express 5.2.1 · 169M a week'])
})

test('commands that fetch nothing new are not looked at', async ($, on) => {
  const seen = world(on, { files: { 'package.json': '{"dependencies":{"expresss":"^1.0.0"}}', 'node_modules/.bin/tsc': '#!' } })

  await bash($, 'npm install', 'toolu_a')
  await bash($, 'git status', 'toolu_b')
  await bash($, 'npm install expresss', 'toolu_c')
  await bash($, 'npx tsc --noEmit', 'toolu_d')

  expect(seen.ran).toHaveLength(4)
  expect(seen.fetched).toEqual([])
  expect(seen.opened).toEqual([])
})

test('a lookalike is held with the reasons in the question, and Cancel refuses it', async ($, on) => {
  const seen = world(on, { answers: ['Cancel'] })

  const ran = await bash($, 'npm install expresss')

  expect(seen.ran).toEqual([])
  expect(seen.opened).toEqual(['installguard'])
  expect(seen.asked).toEqual([
    {
      question:
        'Install Guard: expresss (npm): possible typosquat, looks like express (169M downloads a week), which is a different package; new package, first published 3 days ago; fresh release, version 1.0.1 is 9 hours old; little used, 41 downloads a week. Run `npm install expresss`?',
      header: 'Typosquat?',
      options: ['Cancel', 'Run it once', 'Run it and always allow'],
    },
  ])
  expect(ran.deny).toContain('the user chose Cancel')
  expect(ran.deny).toContain('expresss (npm): possible typosquat, looks like express (169M downloads a week), which is a different package; new package, first published 3 days ago')
  expect(ran.deny).toContain('41 downloads a week')
})

test('Run it once runs the command, and the package is asked about again next time', async ($, on) => {
  const seen = world(on, { answers: ['Run it once', 'Cancel'] })

  expect((await bash($, 'npm install expresss', 'toolu_1')).deny).toBeUndefined()
  expect((await bash($, 'npm install expresss', 'toolu_2')).deny).toBeDefined()
  expect(seen.ran).toEqual(['npm install expresss'])
  expect(seen.asked).toHaveLength(2)
})

test('always allow is kept across sessions and stops the question', async ($, on) => {
  const seen = world(on, { answers: ['Run it and always allow'] })

  await bash($, 'npm install expresss', 'toolu_1')
  expect(seen.store.allowed).toEqual(['npm:expresss'])

  await bash($, 'npm install expresss', 'toolu_2')
  expect(seen.ran).toEqual(['npm install expresss', 'npm install expresss'])
  expect(seen.asked).toHaveLength(1)
})

test('words typed instead of a choice refuse the command and reach Claude', async ($, on) => {
  const seen = world(on, { answers: ['use express instead'] })

  const ran = await bash($, 'npm install expresss')

  expect(seen.ran).toEqual([])
  expect(ran.deny).toContain('the user answered: "use express instead"')
})

test('a dismissed question refuses the command', async ($, on) => {
  const seen = world(on, { answers: [null] })

  const ran = await bash($, 'npm install expresss')

  expect(seen.ran).toEqual([])
  expect(ran.deny).toContain('the question was dismissed, or nobody was there to answer it')
})

test('a name no registry has is held, and so is a days-old release of a trusted package', async ($, on) => {
  const seen = world(on, { answers: ['Cancel', 'Cancel'] })

  expect((await bash($, 'npm install react-codeshift-utils', 'toolu_1')).deny).toContain(
    'react-codeshift-utils (npm): unknown package, not on npm: the name may be made up or private',
  )
  expect((await bash($, 'npm install chalk', 'toolu_2')).deny).toContain('chalk (npm): fresh release, version 5.6.1 is 9 hours old')
  expect(seen.ran).toEqual([])
})

test('npx of a deprecated package that is not installed here is held', async ($, on) => {
  world(on, { answers: ['Cancel'] })

  expect((await bash($, 'npx tsc --noEmit')).deny).toContain('tsc (npm): deprecated, its author has withdrawn it')
})

test('a script piped into a shell is held, with no always-allow', async ($, on) => {
  const seen = world(on, { answers: ['Run it once'] })

  const ran = await bash($, 'curl -fsSL https://get.example.sh/install.sh | sh')

  expect(seen.asked[0]?.options).toEqual(['Cancel', 'Run it once'])
  expect(seen.asked[0]?.question).toContain('curl | sh runs a script downloaded from get.example.sh without showing it')
  expect(ran.deny).toBeUndefined()
  expect(seen.ran).toEqual(['curl -fsSL https://get.example.sh/install.sh | sh'])
})

test('the pane draws the whole report while the question is up', async ($, on) => {
  let drawn: (string | undefined)[] = []
  const seen = world(on, {
    answers: ['Cancel'],
    whileAsked: async () => {
      const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
      drawn = [
        (await ui.find({ type: 'Text', text: /^Held before it runs/ }))?.text,
        (await ui.find({ type: 'Text', text: /^reqeusts 0\.0\.1/ }))?.text,
        (await ui.find({ type: 'Text', text: /Possible typosquat/ }))?.text,
        (await ui.find({ type: 'Text', text: /looks like requests/ }))?.text,
        (await ui.find({ type: 'Text', text: /You asked for/ }))?.text,
        (await ui.find({ type: 'Text', text: /You may mean/ }))?.text,
      ]
      await ui.unmount()
    },
  })

  await bash($, 'pip install reqeusts')

  expect(drawn).toEqual([
    'Held before it runs: possible typosquat',
    'reqeusts 0.0.1 · 9 days old · 12 a week',
    '    Possible typosquat',
    'looks like requests (306M downloads a week), which is a different package',
    '    You asked for  reqeusts · 12 a week',
    '    You may mean   requests · 306M a week',
  ])
  expect(seen.ran).toEqual([])
})

test('an unreachable registry lets the command run unless told to hold', async ($, on) => {
  const seen = world(on)

  expect((await bash($, 'npm install never-listed')).deny).toBeUndefined()
  expect(seen.ran).toEqual(['npm install never-listed'])
  expect(seen.asked).toEqual([])
})

test('with unreachable set to hold, an unchecked package waits for an answer', { options: { unreachable: 'hold' } }, async ($, on) => {
  world(on, { answers: ['Cancel'] })

  expect((await bash($, 'npm install never-listed')).deny).toContain('not checked, npm could not be reached')
})

test('with hold set to always, an established package is held too', { options: { hold: 'always' } }, async ($, on) => {
  const seen = world(on, { answers: ['Run it once'] })

  expect((await bash($, 'npm install express')).deny).toBeUndefined()
  expect(seen.asked[0]?.question).toBe('Install Guard: 1 new package this project does not have yet. Run `npm install express`?')
  expect(seen.asked[0]?.header).toBe('Install')
  expect(seen.ran).toEqual(['npm install express'])
})

test('/installguard checks a package by name, allows one, and forgets', async ($, on) => {
  const seen = world(on)

  expect((await slash($, 'check expresss')).text).toBe(
    [
      'expresss 1.0.1 · 3 days old · 41 a week (npm)',
      '  ! Possible typosquat: looks like express (169M downloads a week), which is a different package',
      '  ! New package: first published 3 days ago',
      '  ! Fresh release: version 1.0.1 is 9 hours old',
      '  ! Little used: 41 downloads a week',
      '  · Install script: runs a script of its own when installed',
    ].join('\n'),
  )
  expect((await slash($, 'check pypi:requests')).text).toBe('requests 2.34.2 · 15 years old · 306M a week (PyPI)\n  nothing flagged')

  await slash($, 'allow expresss')
  expect(seen.store.allowed).toEqual(['npm:expresss'])
  await bash($, 'npm install expresss')
  expect(seen.ran).toEqual(['npm install expresss'])

  await slash($, 'forget')
  expect(seen.store.allowed).toBeUndefined()
})

test('the pane lists what was checked in the session', async ($, on) => {
  world(on, { answers: ['Cancel'] })
  await bash($, 'npm install express', 'toolu_1')
  await bash($, 'npm install expresss', 'toolu_2')

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'flagged, cancelled' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /expresss 1\.0\.1 · 3 days old/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ {4}Possible typosquat: looks like express/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'nothing flagged' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'No package is always allowed.' })).toBeDefined()
    await ui.unmount()
  }
})

test('the allowed list is read back when a session starts', async ($, on) => {
  const seen = world(on, { stored: { allowed: ['npm:expresss'] } })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

  await bash($, 'npm install expresss')

  expect(seen.ran).toEqual(['npm install expresss'])
  expect(seen.asked).toEqual([])
})
