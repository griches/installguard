import type { Ecosystem, Facts, Flag, Request } from '../types'
import { POPULAR } from './popular'

export type Thresholds = {
  /** A package first published fewer days ago than this is new. */
  minAgeDays: number
  /** A version published fewer days ago than this is fresh: most poisoned releases are pulled within days. */
  cooldownDays: number
  minWeeklyDownloads: number
  /** Whether a registry that cannot be reached holds the command. */
  holdsUnchecked: boolean
}

const DAY = 86_400_000
const REGISTRY: Record<Ecosystem, string> = { npm: 'npm', pypi: 'PyPI', crates: 'crates.io', rubygems: 'RubyGems' }
/** A package this well used is not called a typosquat of its neighbour. */
const ESTABLISHED = 100_000

export const registryName = (ecosystem: Ecosystem) => REGISTRY[ecosystem]

/** `3 hours`, `4 days`, `7 months`, `11 years`. */
export const span = (ms: number) => {
  const steps: [number, string][] = [
    [365 * DAY, 'year'],
    [30 * DAY, 'month'],
    [DAY, 'day'],
    [3_600_000, 'hour'],
  ]

  for (const [size, word] of steps) {
    if (ms >= size) {
      const count = Math.floor(ms / size)

      return `${count} ${word}${count === 1 ? '' : 's'}`
    }
  }

  return 'under an hour'
}

/** `212`, `48k`, `31M`. */
export const compact = (count: number) => {
  if (count < 1000) {
    return `${count}`
  }

  return count < 1_000_000 ? `${Math.round(count / 1000)}k` : `${Math.round(count / 1_000_000)}M`
}

/** Edits between two names, a swap of neighbours counting as one; stops caring past two. */
const distance = (a: string, b: string) => {
  if (Math.abs(a.length - b.length) > 1) {
    return 2
  }

  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])

  for (let j = 0; j <= b.length; j += 1) {
    ;(rows[0] as number[])[j] = j
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const row = rows[i] as number[]
      const above = rows[i - 1] as number[]
      row[j] = Math.min((above[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (above[j - 1] ?? 0) + cost)

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j] ?? 0, ((rows[i - 2] as number[])[j - 2] ?? 0) + 1)
      }
    }
  }

  return (rows[a.length] as number[])[b.length] ?? 2
}

const squashed = (name: string) => name.replace(/[-_.]/g, '')

/** The well-known package `name` could be mistaken for, when it is not one itself. */
export const lookalike = (ecosystem: Ecosystem, name: string): string | null => {
  const known = POPULAR[ecosystem]
  const bare = name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name

  if (known.includes(name) || bare.length < 4) {
    return null
  }

  return (
    known.find(one => one !== bare && squashed(one) === squashed(bare)) ??
    known.find(one => one.length >= 4 && one !== bare && distance(one, bare) === 1) ??
    null
  )
}

/** What about a package is worth a person's attention before it is fetched. */
export const assess = (request: Request, facts: Facts, thresholds: Thresholds, now: number): Flag[] => {
  const registry = REGISTRY[request.ecosystem]

  if (!facts.isChecked) {
    return [{ kind: 'unchecked', label: 'Not checked', level: thresholds.holdsUnchecked ? 'risk' : 'note', text: `${registry} could not be reached, so it was not checked` }]
  }

  const near = lookalike(request.ecosystem, request.name)

  if (!facts.isFound) {
    const hint = near === null ? '' : `; did you mean ${near}?`

    return [{ kind: 'missing', label: 'Unknown package', level: 'risk', text: `not on ${registry}: the name may be made up or private${hint}`, ...(near === null ? {} : { near }) }]
  }

  const flags: Flag[] = []
  const isEstablished = (facts.weeklyDownloads ?? 0) >= ESTABLISHED

  if (near !== null && !isEstablished) {
    flags.push({ kind: 'typosquat', label: 'Possible typosquat', level: 'risk', text: `looks like ${near}, which is a different package`, near })
  }

  if (facts.createdAt !== null && now - facts.createdAt < thresholds.minAgeDays * DAY) {
    flags.push({ kind: 'new', label: 'New package', level: 'risk', text: `first published ${span(Math.max(0, now - facts.createdAt))} ago` })
  }

  if (facts.publishedAt !== null && now - facts.publishedAt < thresholds.cooldownDays * DAY) {
    const version = facts.version === null ? 'this version' : `version ${facts.version}`
    flags.push({ kind: 'fresh', label: 'Fresh release', level: 'risk', text: `${version} is ${span(Math.max(0, now - facts.publishedAt))} old` })
  }

  if (facts.isTooNewToDate === true) {
    flags.push({ kind: 'fresh', label: 'Fresh release', level: 'risk', text: `version ${facts.version ?? request.version} is too new to have a publish date on record yet` })
  }

  // A version asked for by number whose date the registry did not give cannot be called old enough.
  if (facts.isTooNewToDate !== true && request.version !== null && facts.version === request.version && facts.publishedAt === null && request.ecosystem !== 'rubygems') {
    flags.push({
      kind: 'undated',
      label: 'Release date unknown',
      level: thresholds.holdsUnchecked ? 'risk' : 'note',
      text: `the date of version ${request.version} could not be read, so its age was not checked`,
    })
  }

  if (facts.weeklyDownloads !== null && facts.weeklyDownloads < thresholds.minWeeklyDownloads) {
    flags.push({ kind: 'unpopular', label: 'Little used', level: 'risk', text: `${compact(facts.weeklyDownloads)} downloads a week` })
  }

  if (facts.hasInstallScript) {
    flags.push({ kind: 'script', label: 'Install script', level: 'note', text: 'runs a script of its own when installed' })
  }

  if (facts.isSourceOnly) {
    flags.push({ kind: 'source-only', label: 'Source only', level: 'note', text: 'ships source only, so installing runs its build code' })
  }

  if (facts.isDeprecated) {
    flags.push({ kind: 'deprecated', label: 'Deprecated', level: 'note', text: 'its author has withdrawn it' })
  }

  return flags
}

/** `express 4.21.0 · 11 years old · 31M a week`: what the registry knows, on one line. */
export const summary = (request: Request, facts: Facts, now: number) => {
  const parts = [facts.version === null ? request.name : `${request.name} ${facts.version}`]

  if (facts.createdAt !== null) {
    parts.push(`${span(Math.max(0, now - facts.createdAt))} old`)
  }

  if (facts.weeklyDownloads !== null) {
    parts.push(`${compact(facts.weeklyDownloads)} a week`)
  }

  return parts.join(' · ')
}
