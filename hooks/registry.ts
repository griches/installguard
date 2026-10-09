import type { Facts, Request } from '../types'

/** Fetches a URL and answers its status and body, or null when the host could not be reached. */
export type Get = (url: string) => Promise<{ status: number; text: string } | null>

/** Below this many weekly downloads npm's whole record of a package is small enough to read for its dates. */
const SMALL_PACKAGE = 10_000

const UNCHECKED: Facts = {
  isChecked: false,
  isFound: false,
  version: null,
  createdAt: null,
  publishedAt: null,
  weeklyDownloads: null,
  hasInstallScript: false,
  isDeprecated: false,
  isSourceOnly: false,
}
const MISSING: Facts = { ...UNCHECKED, isChecked: true }

type Json = Record<string, unknown>

const json = (text: string | undefined): Json | null => {
  try {
    const parsed: unknown = JSON.parse(text ?? '')

    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Json) : null
  } catch {
    return null
  }
}

const record = (value: unknown): Json => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {})

const list = (value: unknown): Json[] => (Array.isArray(value) ? value.map(record) : [])

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

const time = (value: unknown) => {
  const at = typeof value === 'string' ? Date.parse(value) : Number.NaN

  return Number.isNaN(at) ? null : at
}

const earliest = (times: readonly (number | null)[]) => {
  const known = times.filter(one => one !== null)

  return known.length === 0 ? null : Math.min(...known)
}

const npm = async (get: Get, request: Request): Promise<Facts> => {
  const name = request.name.replace('/', '%2F')
  const [asked, downloads] = await Promise.all([
    get(`https://registry.npmjs.org/${name}/${request.version ?? 'latest'}`),
    get(`https://api.npmjs.org/downloads/point/last-week/${request.name}`),
  ])

  if (asked === null) {
    return UNCHECKED
  }

  // A pinned version the registry lacks still tells nothing of the package itself.
  const found = asked.status === 404 && request.version !== null ? await get(`https://registry.npmjs.org/${name}/latest`) : asked

  if (found === null || (found.status !== 200 && found.status !== 404)) {
    return UNCHECKED
  }

  const manifest = found.status === 200 ? json(found.text) : null

  if (manifest === null) {
    return MISSING
  }

  const scripts = record(manifest.scripts)
  const version = text(manifest.version)
  const weeklyDownloads = downloads?.status === 200 ? count(json(downloads.text)?.downloads) : null
  let createdAt: number | null = null
  let publishedAt: number | null = null

  // A pinned version's date is only in the package's whole record, however large that is:
  // a release an hour old must not pass for want of asking.
  if (weeklyDownloads === null || weeklyDownloads < SMALL_PACKAGE || request.version !== null) {
    const times = record(json((await get(`https://registry.npmjs.org/${name}`))?.text)?.time)
    createdAt = time(times.created)
    publishedAt = version === null ? null : time(times[version])
  } else if (request.version === null) {
    const hits = list(json((await get(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(request.name)}&size=5`))?.text)?.objects)
    const own = hits.map(hit => record(hit.package)).find(one => one.name === request.name)
    publishedAt = own?.version === version ? time(own?.date) : null
  }

  return {
    isChecked: true,
    isFound: true,
    version,
    createdAt,
    publishedAt,
    weeklyDownloads,
    hasInstallScript: ['preinstall', 'install', 'postinstall'].some(one => text(scripts[one]) !== null),
    isDeprecated: text(manifest.deprecated) !== null,
    isSourceOnly: false,
  }
}

const pypi = async (get: Get, request: Request): Promise<Facts> => {
  const [found, downloads] = await Promise.all([
    get(`https://pypi.org/pypi/${request.name}/json`),
    get(`https://pypistats.org/api/packages/${request.name}/recent`),
  ])

  if (found === null || (found.status !== 200 && found.status !== 404)) {
    return UNCHECKED
  }

  const body = found.status === 200 ? json(found.text) : null

  if (body === null) {
    return MISSING
  }

  const releases = record(body.releases)
  const version = request.version ?? text(record(body.info).version)
  const files = version === null ? [] : list(releases[version])

  return {
    isChecked: true,
    isFound: true,
    version,
    createdAt: earliest(Object.values(releases).flatMap(release => list(release).map(file => time(file.upload_time_iso_8601)))),
    publishedAt: earliest(files.map(file => time(file.upload_time_iso_8601))),
    weeklyDownloads: downloads?.status === 200 ? count(record(json(downloads.text)?.data).last_week) : null,
    hasInstallScript: false,
    isDeprecated: files.length > 0 && files.every(file => file.yanked === true),
    isSourceOnly: files.length > 0 && files.every(file => file.packagetype === 'sdist'),
  }
}

const crates = async (get: Get, request: Request): Promise<Facts> => {
  const found = await get(`https://crates.io/api/v1/crates/${request.name}`)

  if (found === null || (found.status !== 200 && found.status !== 404)) {
    return UNCHECKED
  }

  const body = found.status === 200 ? json(found.text) : null

  if (body === null) {
    return MISSING
  }

  const crate = record(body.crate)
  const version = request.version ?? text(crate.max_stable_version) ?? text(crate.newest_version)
  const published = list(body.versions).find(one => one.num === version)
  const recent = count(crate.recent_downloads)

  return {
    isChecked: true,
    isFound: true,
    version,
    createdAt: time(crate.created_at),
    publishedAt: time(published?.created_at),
    // crates.io counts the last ninety days.
    weeklyDownloads: recent === null ? null : Math.round(recent / 13),
    hasInstallScript: false,
    isDeprecated: published?.yanked === true,
    isSourceOnly: false,
  }
}

const rubygems = async (get: Get, request: Request): Promise<Facts> => {
  const [found, versions] = await Promise.all([
    get(`https://rubygems.org/api/v1/gems/${request.name}.json`),
    get(`https://rubygems.org/api/v1/versions/${request.name}.json`),
  ])

  if (found === null || (found.status !== 200 && found.status !== 404)) {
    return UNCHECKED
  }

  const body = found.status === 200 ? json(found.text) : null

  if (body === null) {
    return MISSING
  }

  let history: Json[] = []

  try {
    history = versions?.status === 200 ? list(JSON.parse(versions.text)) : []
  } catch {
    history = []
  }

  const version = request.version ?? text(body.version)

  return {
    isChecked: true,
    isFound: true,
    version,
    createdAt: earliest(history.map(one => time(one.created_at))),
    publishedAt: time(history.find(one => one.number === version)?.created_at) ?? (request.version === null ? time(body.version_created_at) : null),
    // RubyGems publishes a total, not a rate, so popularity is left unjudged.
    weeklyDownloads: null,
    hasInstallScript: false,
    isDeprecated: false,
    isSourceOnly: false,
  }
}

const REGISTRY = { npm, pypi, crates, rubygems }

/** What the package's own registry says of it. Never throws: a registry that cannot be read answers `isChecked: false`. */
export const lookup = async (get: Get, request: Request): Promise<Facts> => {
  try {
    return await REGISTRY[request.ecosystem](get, request)
  } catch {
    return UNCHECKED
  }
}
