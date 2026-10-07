---
name: import
description: Bring the product this repository builds into an empty unbranch project as its first picture — drafted from the code, its docs, the files around it and every other tool connected to this session, and left as a draft for the developer to send for review on the web. Use when the developer asks to import or bring the product into unbranch, or runs /unbranch:import.
---

Draft the first picture of the product from everything this session can
reach, with the developer's confirmation, and leave it as a draft.

1. Read `.unbranch.json` for the project id. No project: say
   `npx @unbranch/kit init --project <id>` sets it, and stop.
2. `read_overview` for the project. If it already has directions, or a
   proposal in review, there is nothing to import: say so — a change goes in
   as a proposal (`read_instructions` topic `draft`) — and stop.
3. Read `read_instructions` with `topic: "import"` and follow it: it holds the
   method and the concepts. What follows is what a repository adds to it.
4. Gather, and say what you are reading as you go:
   - this repository: the README, `docs/` (feature documents, SNAPSHOT for
     what is built, BACKLOG for what is not), release notes or a changelog,
     and the screens, routes, commands or API the code exposes. The code says
     what is built; the docs say why, and for whom;
   - other repositories of the same product, when the developer points you to
     them;
   - every other tool connected to this session — a wiki, a document store, an
     issue tracker, a design tool: search each for the product by name.
   Then summarise in a few lines what you read, and ask once what else exists:
   another repository, a space you could not reach, a document only someone
   on the team has.
5. Keep only what someone can use today. The backlog, open tickets, features
   behind a flag that is off, routes with no screen and TODOs stay out. Where
   the code and the docs disagree, ask.
6. Before writing, show the outline: each direction with its capabilities,
   the constraints, and what you left out and why. Wait for the developer's
   yes.
7. Write it with `write_draft` as one baseline and give its link. Do not send
   it: say they read it and send it for review on the web, where the team
   agrees to it.
8. Once the team has agreed to it, `/unbranch:link` links the feature
   documents to its capabilities — say so if `docs.features` is set.

End with a line saying how many directions, capabilities and constraints
went in, and what was left out.
