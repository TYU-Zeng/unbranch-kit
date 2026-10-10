# unbranch-kit

`@unbranch/kit` on npm (`bin/`, `src/`: `init` and `doctor`) and the unbranch
Claude Code plugin (`skills/`, `agents/`, `.claude-plugin/`), from one
repository and one version.

## Commits decide the version

Releases are automatic: release-please reads the commits on `main`, keeps a
release PR open with the next version and the changelog, and merging that PR
tags the release and publishes to npm. Write every commit as a Conventional
Commit, because its type is what sets the next version:

| Type | When | Next version (before 1.0) |
| --- | --- | --- |
| `feat:` | Something a user can now do: a new skill, command, flag, or a skill that now behaves differently | minor: 0.3.0 → 0.4.0 |
| `fix:` | Something that did not work as described now does | patch: 0.3.0 → 0.3.1 |
| `feat!:` or a `BREAKING CHANGE:` footer | A user must change something: a skill, command or flag removed or renamed, `.unbranch.json` or `.mcp.json` written differently | minor before 1.0, major after |
| `refactor:` `docs:` `test:` `ci:` `chore:` | Nothing a user sees changes | no release |

- A `Release-As: 1.0.0` footer releases exactly that version.
- A change to a skill reaches people who already installed the plugin only
  through a release, so a skill change that matters to them is `feat:` or
  `fix:`, never `refactor:` or `docs:`.
- The subject says what the user gets, lowercase, imperative, no full stop:
  `feat: ask where the product is before an import outlines it`. The body says
  why.
- Merge pull requests with a merge commit, so release-please sees each commit.
  If a PR is squashed, its title becomes the commit and must follow the same
  rules.

## Never by hand

- The version in `package.json`, `.claude-plugin/plugin.json` and
  `.release-please-manifest.json`, and `CHANGELOG.md`: the release PR changes
  them. Claude Code updates an installed plugin only when `plugin.json`'s
  version changes, and a test fails if it differs from `package.json`.
- `main` takes changes only through pull requests, and the tests must pass.
- `.mcp.json` and `.unbranch.json` at this repository's root are never
  committed: here a `.mcp.json` would ship as the plugin's own MCP server. The
  tests fail while either is there, so run them in a clean checkout.
