---
name: import
description: Bring the product this repository builds into an empty unbranch project as its first picture — drafted from the code, its docs, the files around it and the other tools connected to this session that the developer points it to, and left as a draft for the developer to send for review on the web. Use when the developer asks to import or bring the product into unbranch, or runs /unbranch:import.
---

Draft the first picture of the product from everything this session can
reach, with the developer's confirmation, and leave it as a draft.

1. Read `.unbranch.json` for the project id. No project: say
   `npx @unbranch/kit init --project <id>` sets it, and stop.
2. `read_overview` for the project. If it already has directions, or a
   proposal in review, there is nothing to import: say so — a change goes in
   as a proposal (`read_instructions` topic `draft`) — and stop.
3. Read `read_instructions` with `topic: "import"` and follow it: the method —
   what to gather, what counts as built, the outline the developer agrees to
   before anything is written — and the concepts are there. This skill adds
   where a repository's material is, and asks two of the guide's questions
   in a set way.
4. Read this repository, and say what you are reading as you go:
   - the README, `docs/` (feature documents, SNAPSHOT for what is built,
     BACKLOG for what is not), release notes or a changelog;
   - the screens, routes, commands or API the code exposes: the code says what
     is built, the docs say why, and for whom. Where they disagree, ask.
5. **Ask whether the product is in other repositories too**, in your first
   reply. Do not list or search the folders around this one to find out: a
   product's other repositories may sit beside it or anywhere else, and only
   the developer knows which are its. Ask it as a choice:
   - **Only this repository** — the whole product is here.
   - **Several repositories** — and where the others are: a path, or a link.
   - **Other** — in their words.

   Use the AskUserQuestion tool when the session has it (it adds Other
   itself); otherwise give the options as a numbered list in your reply.
   Then read the repositories the developer names, as you read this one, and
   no others.
6. **Ask how the product splits before any outline**, once you have read
   what you were pointed to. Repositories split a product by how it is built
   — an app, its back office, a server — which is not necessarily how the
   team thinks of it. Say the split you see, and ask it as a choice too: the
   parts as separate directions, all as one direction, or other — each option
   with what it would hold. A repository that only serves the others, such as
   a backend, is not a direction of its own. Show no outline until this is
   answered; then show it as the import guide says, and wait for a yes.
7. Toward unbranch, only read the project and write the draft with
   `write_draft`. Never send it: the developer reads it and sends it for
   review on the web, where the team agrees to it.
8. Once the team has agreed to it, `/unbranch:link` links the feature
   documents to its capabilities — say so if `docs.features` is set.

End with a line saying how many directions, capabilities and constraints
went in, and what was left out.
