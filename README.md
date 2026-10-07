# unbranch

Connect a repository — and the coding agent working in it — to your team's
agreed product model in [unbranch](https://unbranch.ai), and check the work
against it.

```bash
npx @unbranch/kit init
```

Installed globally (`npm i -g @unbranch/kit`), the command is plain
`unbranch` — `unbranch init`, `unbranch doctor`.

## What `init` does

It looks first, then fills only what is missing. It lists what the repository
already has — docs, a doc-sync command, skills about progress, pre-push hooks,
other MCP servers pointing at unbranch — and never overwrites any of it.

Then, at the root of your repository:

| File | What it holds |
| --- | --- |
| `.unbranch.json` | Which unbranch project this repository builds, the server, where your docs are (`docs`), and whether `/unbranch:progress` answers on its own (`autoProgress`). |
| `.mcp.json` | unbranch as an MCP server for Claude Code. Other servers in it are kept. |
| `.claude/settings.json` | The unbranch skills, if you install them — written by Claude Code's own plugin command. |
| `CLAUDE.md` | A short note on the commands, between `<!-- unbranch -->` markers. Nothing else in the file is touched. |

All of them are meant to be committed so the team shares the setup. None holds
a password or a key: Claude Code signs in through unbranch when it first
connects.

Then, in Claude Code:

1. Open Claude Code at the repository's root and allow the **unbranch** server when asked.
2. Run `/mcp`, choose **unbranch** and sign in — your browser opens unbranch to approve.
3. If you did not give a project yet, ask Claude *"which unbranch projects can I
   reach?"*, then run `npx @unbranch/kit init --project <id>`.

```bash
npx @unbranch/kit init --project <id> --name "e-menu"        # bind without being asked
npx @unbranch/kit init --server https://api-dev.unbranch.ai  # another server
npx @unbranch/kit init --skills                              # install the skills without asking
npx @unbranch/kit init --yes                                 # ask nothing (skills only with --skills)
```

## The skills

Installed into the project with Claude Code's plugin system, from this
repository's marketplace:

| Command | What it does |
| --- | --- |
| `/unbranch:progress` | Where the work stands, by agreed capability — built, in progress, parked, not started, under discussion, and work no agreed capability covers — from your SNAPSHOT and BACKLOG and unbranch together. Also answers on its own when you ask what is done or what is next, unless `autoProgress` is `false`. |
| `/unbranch:status` | What waits for you: proposals you have not answered, work being delivered. |
| `/unbranch:import` | Brings the product into an empty project as its first picture: reads this repository and the files around it, asks which of the other tools connected to your session — a wiki, a document store, an issue tracker — hold the product and reads only there, shows you the outline, and leaves a draft for you to send for review on the web. |
| `/unbranch:link` | Links each feature document to the capability it builds — a line in its front matter, after you confirm each one — and records which part of the product this repository builds. |

They read and report; they never change your code, and `progress` and `status`
run in a read-only subagent of their own. Install them by hand with:

```bash
claude plugin marketplace add TYU-Zeng/unbranch-kit --scope project
claude plugin install unbranch@unbranch-kit --scope project
```

## `doctor`

```bash
npx @unbranch/kit doctor
```

Checks the files, that the server answers, whether another MCP server would
clash with the project's (a local `unbranch` server wins over `.mcp.json`; one
under another name at an unbranch address gives the agent two sets of tools),
and whether the skills are installed. Each failed check says what to run.

## Requirements

Node.js 20 or later. Claude Code for the agent side and the skills; other MCP
clients can use the same server address by hand.

## Releasing

Releases are cut by CI, never by hand. Commits follow
[Conventional Commits](https://www.conventionalcommits.org); on every push to
`main`, [release-please](https://github.com/googleapis/release-please) keeps a
release PR open with the next version and its changelog — `feat` bumps the
minor version and `fix` the patch while the package is below 1.0. Merging that
PR tags the release and publishes `@unbranch/kit` to npm from
`.github/workflows/release.yml`, through npm trusted publishing: no npm token is
stored anywhere, and every version carries provenance back to this repository.

## License

MIT
