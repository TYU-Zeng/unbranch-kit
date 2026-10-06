# unbranch

Connect a repository — and the coding agent working in it — to your team's
agreed product model in [unbranch](https://unbranch.ai).

```bash
npx unbranch init
```

## What `init` does

It writes two small files at the root of your repository — found from the
folder you run it in — both meant to be committed so the whole team shares
them. Neither holds a password or a key.

| File | What it holds |
| --- | --- |
| `.unbranch.json` | Which unbranch project this repository builds, and the server. |
| `.mcp.json` | unbranch as an MCP server for Claude Code. |

Other servers already in `.mcp.json`, and anything else in `.unbranch.json`,
are kept. Running it again changes only what you ask it to.

Then, in Claude Code:

1. Open Claude Code at the repository's root and allow the **unbranch** server when asked.
2. Run `/mcp`, choose **unbranch** and sign in — your browser opens unbranch to
   approve. Claude Code keeps and refreshes the sign-in; nothing is stored in the
   repository.
3. If you did not give a project yet, ask Claude *"which unbranch projects can I
   reach?"*, then run `npx unbranch init --project <id>`.

Your agent can now read what the team agreed — directions, capabilities and
constraints — and draft proposals for the team to review.

```bash
npx unbranch init --project <id> --name "e-menu"   # bind without being asked
npx unbranch init --server https://api-dev.unbranch.ai   # another server
npx unbranch init --yes                              # ask nothing
```

## `doctor`

```bash
npx unbranch doctor
```

Checks that both files are in place and agree, and that the server answers.
Each failed check says what to run. It signs in to nothing, so whether you can
reach your project is what Claude Code's `/mcp` shows.

## Requirements

Node.js 20 or later. Claude Code for the agent side; other MCP clients can use
the same server address by hand.

## What comes next

This is the first piece of the unbranch developer kit: the connection. Checking
your work against what the team agreed — progress by capability, drift, a check
before you push — comes in later versions, as a Claude Code plugin.

## License

MIT
