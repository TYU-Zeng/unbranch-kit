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
   only where a repository's material is.
4. In a repository, say what you are reading as you go:
   - the README, `docs/` (feature documents, SNAPSHOT for what is built,
     BACKLOG for what is not), release notes or a changelog;
   - the screens, routes, commands or API the code exposes: the code says what
     is built, the docs say why, and for whom. Where they disagree, ask;
   - other repositories of the same product, when the developer points you to
     them.
5. Toward unbranch, only read the project and write the draft with
   `write_draft`. Never send it: the developer reads it and sends it for
   review on the web, where the team agrees to it.
6. Once the team has agreed to it, `/unbranch:link` links the feature
   documents to its capabilities — say so if `docs.features` is set.

End with a line saying how many directions, capabilities and constraints
went in, and what was left out.
