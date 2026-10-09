// Registry answers in each registry's real shape, cut down to the fields read. `NOW` is the day they are judged on.

export const NOW = Date.parse('2026-10-09T12:00:00Z')

const body = (value: unknown) => ({ status: 200, text: JSON.stringify(value) })
const missing = { status: 404, text: '{"error":"Not found"}' }

/** URL to answer. A URL not listed is a registry that cannot be reached. */
export const WEB: Record<string, { status: number; text: string }> = {
  // express: old, hugely used, nothing to say.
  'https://registry.npmjs.org/express/latest': body({ name: 'express', version: '5.2.1', maintainers: [{}, {}] }),
  'https://api.npmjs.org/downloads/point/last-week/express': body({ downloads: 169_483_150, package: 'express' }),
  'https://registry.npmjs.org/-/v1/search?text=express&size=5': body({
    objects: [{ package: { name: 'express', version: '5.2.1', date: '2025-12-01T20:49:43.268Z' } }],
  }),

  // expresss: three days old, barely used, one letter from express, with an install script.
  'https://registry.npmjs.org/expresss/latest': body({ name: 'expresss', version: '1.0.1', scripts: { postinstall: 'node setup.js' } }),
  'https://api.npmjs.org/downloads/point/last-week/expresss': body({ downloads: 41, package: 'expresss' }),
  'https://registry.npmjs.org/expresss': body({
    time: { created: '2026-10-06T09:00:00.000Z', '1.0.0': '2026-10-06T09:00:00.000Z', '1.0.1': '2026-10-09T03:00:00.000Z' },
  }),

  // chalk: established, but its newest version went up nine hours ago.
  'https://registry.npmjs.org/chalk/latest': body({ name: 'chalk', version: '5.6.1' }),
  'https://api.npmjs.org/downloads/point/last-week/chalk': body({ downloads: 310_000_000, package: 'chalk' }),
  'https://registry.npmjs.org/-/v1/search?text=chalk&size=5': body({
    objects: [{ package: { name: 'chalk', version: '5.6.1', date: '2026-10-09T03:00:00.000Z' } }],
  }),

  // tsc: not the TypeScript compiler, and deprecated by npm.
  'https://registry.npmjs.org/tsc/latest': body({ name: 'tsc', version: '2.0.4', deprecated: 'Package no longer supported.' }),
  'https://api.npmjs.org/downloads/point/last-week/tsc': body({ downloads: 704_770, package: 'tsc' }),
  'https://registry.npmjs.org/-/v1/search?text=tsc&size=5': body({ objects: [{ package: { name: 'tsc', version: '2.0.4', date: '2022-01-15T21:44:14.187Z' } }] }),

  // a name a model made up.
  'https://registry.npmjs.org/react-codeshift-utils/latest': missing,
  'https://api.npmjs.org/downloads/point/last-week/react-codeshift-utils': missing,

  'https://pypi.org/pypi/requests/json': body({
    info: { version: '2.34.2' },
    releases: {
      '0.2.0': [{ packagetype: 'sdist', upload_time_iso_8601: '2011-02-14T00:00:00.000000Z' }],
      '2.34.2': [
        { packagetype: 'bdist_wheel', upload_time_iso_8601: '2026-05-14T19:25:26.443000Z' },
        { packagetype: 'sdist', upload_time_iso_8601: '2026-05-14T19:25:27.735762Z' },
      ],
    },
  }),
  'https://pypistats.org/api/packages/requests/recent': body({ data: { last_day: 50_831_095, last_month: 1_202_777_296, last_week: 305_867_432 } }),

  'https://pypi.org/pypi/reqeusts/json': body({
    info: { version: '0.0.1' },
    releases: { '0.0.1': [{ packagetype: 'sdist', upload_time_iso_8601: '2026-09-30T08:00:00.000000Z' }] },
  }),
  'https://pypistats.org/api/packages/reqeusts/recent': body({ data: { last_week: 12 } }),

  'https://crates.io/api/v1/crates/serde': body({
    crate: { created_at: '2014-12-05T20:20:39.487502Z', recent_downloads: 350_261_525, max_stable_version: '1.0.229', newest_version: '1.0.229' },
    versions: [{ num: '1.0.229', created_at: '2026-07-18T23:05:13.266456Z', yanked: false }],
  }),

  'https://rubygems.org/api/v1/gems/rails.json': body({ version: '8.1.4', version_created_at: '2026-09-24T14:22:14.180Z', downloads: 798_610_764 }),
  'https://rubygems.org/api/v1/versions/rails.json': {
    status: 200,
    text: JSON.stringify([
      { number: '8.1.4', created_at: '2026-09-24T14:22:14.180Z' },
      { number: '0.8.0', created_at: '2004-10-25T04:00:00.000Z' },
    ]),
  },
}
