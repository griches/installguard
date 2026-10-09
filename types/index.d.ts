export type Ecosystem = 'npm' | 'pypi' | 'crates' | 'rubygems'

/** One package a command would fetch from a registry. */
export type Request = {
  ecosystem: Ecosystem
  name: string
  /** The version asked for by name, when one was pinned. */
  version: string | null
  /** The command that asks for it: `npm install`, `npx`, `pip install`. */
  via: string
  /** True when the package is run at once, as `npx` and `uvx` do, not only stored. */
  isExecuted: boolean
}

/** Something a command fetches that no registry vouches for. */
export type Oddity = {
  kind: 'pipe-to-shell' | 'remote-source' | 'tap' | 'unreadable'
  detail: string
  via: string
}

/** What a registry says of a package. */
export type Facts = {
  /** False when the registry could not be asked. */
  isChecked: boolean
  /** False when the registry has no package of that name. */
  isFound: boolean
  version: string | null
  /** When the package was first published, in milliseconds. */
  createdAt: number | null
  /** When the version asked for was published, in milliseconds. */
  publishedAt: number | null
  weeklyDownloads: number | null
  hasInstallScript: boolean
  isDeprecated: boolean
  /** True when the version has no built distribution, so installing it runs its build code. */
  isSourceOnly: boolean
}

export type Flag = {
  kind: 'missing' | 'typosquat' | 'new' | 'fresh' | 'undated' | 'unpopular' | 'unchecked' | 'script' | 'deprecated' | 'source-only'
  /** `risk` holds the command for an answer; `note` is only shown. */
  level: 'risk' | 'note'
  /** The kind of concern in two or three words, shown before the detail: `Possible typosquat`. */
  label: string
  text: string
  /** The well-known package this one could be mistaken for, when that is the concern. */
  near?: string
}

export type Checked = Request & {
  facts: Facts
  flags: Flag[]
  /** The package this one looks like, with what its registry says of it. */
  lookalike: { name: string; weeklyDownloads: number | null } | null
}

export type Held = {
  id: string
  command: string
  packages: Checked[]
  oddities: Oddity[]
}

export type Entry = {
  at: number
  /** `passed`: nothing flagged. `installed`, `cancelled`: the person's answer. `unanswered`: nobody answered. */
  outcome: 'passed' | 'installed' | 'cancelled' | 'unanswered'
  packages: Checked[]
  oddities: Oddity[]
}

declare module 'claude-code' {
  interface PluginState {
    'installguard': {
      held: Held | null
      log: Entry[]
      /** `ecosystem:name` of every package the person chose to always allow. */
      allowed: string[]
    }
  }
}
