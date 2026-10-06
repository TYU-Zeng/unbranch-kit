---
name: progress
description: Where this repository's work stands against what the team agreed in unbranch — built, in progress, parked, not started, under discussion, and work no agreed capability covers — from the repository's SNAPSHOT and BACKLOG and the unbranch model together. Use when the developer asks what is done, what is next, where the work stands, or what the to-do list is; or when they run /unbranch:progress. If `.unbranch.json` sets "autoProgress" to false, use it only when they run /unbranch:progress.
context: fork
agent: unbranch:reader
---

Give one answer to "where does the work stand", drawn from the repository's own
record and unbranch together.

1. Read `.unbranch.json`: the project id, `scope` (the directions and
   capabilities this repository builds; absent means the whole project) and
   `docs` (where the feature documents, codebase documents, SNAPSHOT and
   BACKLOG are). If there is no project id, say `npx unbranch init --project
   <id>` sets it, and stop.
2. Read `read_instructions` with `topic: "develop"`.
3. Read the repository's half: the SNAPSHOT (what is built), the BACKLOG (what
   is parked, and why), the feature documents and the capability each names
   in its front matter (`unbranch: <id>`), and `git status` / `git diff` for
   what is in progress on this branch.
4. Read unbranch's half: `read_overview`; `read_model` with a `nodeId` for
   each linked capability you need in detail; `read_status` for what is in
   delivery and in review.
5. Answer grouped by agreed capability within the scope, in this order — what
   the developer acts on first:

   | State | From |
   | --- | --- |
   | In progress | the branch's changes, and a commitment in delivery |
   | Not started | agreed in scope, with no SNAPSHOT entry and no BACKLOG entry |
   | Parked | a BACKLOG entry on a linked capability, with why it waits |
   | Under discussion | a proposal in review touching the scope |
   | Not linked | a SNAPSHOT or BACKLOG entry no capability covers — each with the capability it most likely belongs to |
   | Built | SNAPSHOT entries on a linked capability — last, briefly |

   Add, in a line each, any drift the develop guide names: built and never
   agreed, a link to a capability since replaced, a constraint crossed.
6. Say which sources you read. If the SNAPSHOT or BACKLOG is missing, say the
   built and parked halves are missing rather than showing a picture that
   looks complete. Say what you cannot see — another repository's part.
7. If there are items not linked, end with one line: `/unbranch:link` links
   them, a confirmation each.

Keep it short. Never change a file, and never ask whether something is done.
