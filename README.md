# installguard

**Looks up every new package before Claude installs it.**

installguard is a Claude Code mod. When Claude is about to add a package your project does not already have, installguard asks the registry about it first. An established package installs without a word. A name that does not exist, a lookalike of a popular package, a release that is hours old, or a script piped from the internet into a shell is held, and you are asked before anything runs.

Coding agents invent package names, and attackers register the names they invent. They also install whatever the newest version is, minutes after it is published. installguard is the check a careful person would make, made every time.

## Install

Needs Claude Code 2.1.295 or later.

```
/plugin marketplace add griches/installguard
/plugin install installguard@installguard
```

Or from a shell:

```sh
claude plugin marketplace add griches/installguard
claude plugin install installguard@installguard
```

Run `/reload-plugins` in a session that is already open.

## What is checked

| Registry | Commands |
| --- | --- |
| npm | `npm install`, `pnpm add`, `yarn add`, `bun add`, and packages run at once by `npx`, `pnpm dlx`, `bunx` |
| PyPI | `pip install`, `python -m pip install`, `uv add`, `uv pip install`, `poetry add`, `pdm add`, `pipx`, `uvx` |
| crates.io | `cargo add`, `cargo install` |
| RubyGems | `gem install` |

Outside a registry, these are always held:

- A download piped into a shell or an interpreter: `curl … | sh`, `bash <(curl …)`, `sh -c "$(curl …)"`.
- A package from a git URL, a tarball URL or a `user/repo` shorthand.
- `pip install` from an extra index, or `npm install --registry` pointing anywhere but the public registry.
- An install whose package name comes from a shell variable, since it cannot be read.
- A Homebrew formula from a third-party tap.

## What is flagged

| Flag | Meaning | Default threshold |
| --- | --- | --- |
| Not on the registry | The name may be made up, misspelt or private. The nearest known name is suggested | |
| Lookalike | One edit, one swap or one dropped separator away from a well-known package, and not widely used itself | |
| New package | First published recently | 30 days |
| Fresh version | The version that would install is very new. Most poisoned releases are pulled within days | 3 days |
| Little used | Few downloads a week | 1,000 |
| Deprecated and about to run | `npx` of a package its author has withdrawn, such as `npx tsc` without TypeScript installed | |

Shown but not held on their own: a package that runs an install script, a Python package that ships source only, a deprecated package.

## What is never asked about

- A bare `npm install`, `npm ci` or `pip install -r requirements.txt`: the lockfile or the file is your project's own.
- A package already in `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml` or the `Gemfile`.
- `npx` of something already in `node_modules/.bin`.
- A local path or a workspace package.
- A package you chose to always allow.

## What you see

A package with nothing flagged installs, with a short toast:

```
✓ express 5.2.1 · 141M a week
```

A flagged command is held and Claude Code's own question dialog asks:

```
Install Guard: expresss (npm): looks like express, which is a different package;
693 downloads a week. Run `npm install expresss`?

  1. Cancel
  2. Run it once
  3. Run it and always allow
```

- **Cancel** refuses the command and tells Claude why, so it can offer the package you meant.
- **Run it once** runs it. The package is asked about again next time.
- **Run it and always allow** runs it and remembers the package across sessions.
- **Typing an answer** refuses the command and passes your words to Claude: "use express instead".

The pane (`/installguard`) holds the full report while the question is up, and afterwards the list of what was checked in the session.

In a run with nobody to ask (`claude -p`, CI), a flagged command is refused, not run.

## Commands

```
/installguard                     the pane: what was checked in this session
/installguard check left-pad      look a package up without installing it
/installguard check pypi:requests the same on PyPI (also crates: and rubygems:)
/installguard allow left-pad      always allow a package
/installguard forget              clear the allowed list
```

## Settings

All under installguard in `/config`.

| Setting | Default | What it does |
| --- | --- | --- |
| What is held | flagged | `always`: every command that adds a package the project does not have |
| Sensitivity | balanced | `relaxed`: 7 days, 1 day, 100 downloads a week. `strict`: 90 days, 7 days, 10,000 |
| When a registry cannot be reached | allow | `hold`: the command waits for your answer |
| Say when a package passes | on | Off: no toast for a clean package |

## Limits

- It reads the command line. A package pulled in as a dependency of the one you named is not looked up.
- A package named through a shell variable (`npm install $PKG`) cannot be read, so the command is held for your answer.
- It watches commands, not files. A dependency Claude writes into `package.json` and then installs with a bare `npm install` is not looked up.
- Popularity on RubyGems is not judged, since RubyGems publishes a total and not a rate.
- A private package is "not on the registry" as far as the public registry knows. Answer once with "always allow".
- It is a second look, not a scanner: it does not read the package's code.

## What it does on your machine

installguard is a mod: code that runs inside Claude Code. This is everything it does.

**It watches Bash commands.** It hooks the Bash tool and reads the text of each command before it runs. A command that adds no new package is passed on untouched. It never changes a command, and it runs no command of its own.

**It reads five files in your project folder**, to learn which packages you already depend on: `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml` and `Gemfile`. It also checks whether `node_modules/.bin/<name>` exists. Nothing from these files leaves your machine.

**It asks a public registry about a package, by name.** These are the only hosts it contacts, and the package's name and version are the only things it sends:

| Host | Asked for |
| --- | --- |
| `registry.npmjs.org` | An npm package's version, publish dates, install scripts and deprecation |
| `api.npmjs.org` | An npm package's weekly downloads |
| `pypi.org` | A PyPI package's releases and their dates |
| `pypistats.org` | A PyPI package's weekly downloads |
| `crates.io` | A crate's versions, dates and recent downloads |
| `rubygems.org` | A gem's versions and dates |

It sends no part of your conversation, your code, your files or the command itself. It has no account, no telemetry and no server of its own, and it calls no model.

**It can refuse a command.** When you choose Cancel, when the question is dismissed, or when the guard itself fails on an install command, the command is not run and Claude is told why.

**It keeps one thing between sessions**: the list of packages you chose to always allow, in Claude Code's own plugin storage.

**It adds** the `/installguard` command, a pane, and a question in Claude Code's own dialog. It adds no tools for the model.

## Security

A command is read wherever it stands: after `cd … &&`, inside `bash -c "…"` or `eval`, behind `sudo` or `env`, and after a here-document. If the guard itself fails on a command that fetches a package, the command is refused, not run.

Found a way past it? Open an issue, or for anything sensitive use GitHub's private vulnerability reporting on this repository.

## Development

```sh
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

## Licence

MIT. See [LICENSE](LICENSE).
