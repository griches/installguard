# Privacy policy

installguard is a Claude Code mod written by Gary Riches. This page says what data it handles. It applies to installguard as published at https://github.com/griches/installguard.

## What leaves your machine

When Claude is about to install a package your project does not already have, installguard asks that package's public registry about it. The request contains the package's name, and its version when you pinned one. Nothing else is sent.

| Host | Asked for |
| --- | --- |
| `registry.npmjs.org` | An npm package's version, publish dates, install scripts and deprecation |
| `api.npmjs.org` | An npm package's weekly downloads |
| `pypi.org` | A PyPI package's releases and their dates |
| `pypistats.org` | A PyPI package's weekly downloads |
| `crates.io` | A crate's versions, dates and recent downloads |
| `rubygems.org` | A gem's versions and dates |

Four of these are the registries your package manager contacts when it installs the package. `api.npmjs.org` and `pypistats.org` are the services that publish download counts for npm and PyPI. Each one sees the request as it would see any other, including your IP address, and handles it under its own privacy policy.

A registry is asked only about a package named in a command that is about to run, or one you look up yourself with `/installguard check`.

## What never leaves your machine

- Your conversation with Claude.
- Your code and your files.
- The commands Claude runs.
- The contents of `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml` and `Gemfile`, which are read only to see which packages you already depend on.

## What is stored

One list is kept between sessions: the packages you chose to always allow. It is kept on your machine, in Claude Code's own plugin storage, and is cleared with `/installguard forget`.

## What installguard does not do

- It has no server of its own and no account.
- It collects no analytics, telemetry or crash reports.
- It calls no AI model.
- The author receives no data from it of any kind.

## Changes

Changes to this policy are made in this file, and its history is public in the repository.

## Contact

Questions go to the issue tracker at https://github.com/griches/installguard/issues.
