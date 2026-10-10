---
name: link
description: Link this repository's feature documents to the capabilities they build in unbranch, and record which part of the product the repository builds. Run with /unbranch:link.
disable-model-invocation: true
---

Link each feature document to the agreed capability it builds, with the
developer's confirmation for each one, and record the repository's scope.

1. Read `.unbranch.json`: the project id and `docs.features` (where the
   feature documents are). No project: say `npx @unbranch/kit init --project <id>`
   sets it, and stop. No `docs.features`: ask where the feature documents are,
   and stop if there are none — say `npx @unbranch/kit init` can set the docs up.
2. Read `read_instructions` with `topic: "concepts"`, then `read_overview` and
   `read_model` for the agreed directions and capabilities.
3. For each feature document: read it, and propose the capability it builds —
   or that it builds part of one, or that no agreed capability covers it.
   Show the proposals as one short list — document, capability, why — and ask
   the developer to confirm, correct or skip each. Do not write anything yet.
4. For each confirmed document, add or update one line in its front matter,
   and nothing else in the file:
   - `unbranch: <capability id>`, followed by `# <capability title>` as a
     comment, or `# part: <what this document builds of it>` when it builds
     only part of it.
   - A document with no front matter gets one: `---`, the line, `---`, then
     the document as it was.
   Never change a document's body. Never link one the developer skipped.
5. Ask which directions or capabilities this repository builds — propose them
   from the links just made — and, once confirmed, write them as `scope`
   (a list of ids) in `.unbranch.json`, keeping every other key.
6. A document that builds something no agreed capability covers is not linked.
   Say so, and that it is work the team has not agreed — the developer can
   propose it from here if they want (the `draft` guide in
   `read_instructions`), or leave it.
7. If the project has nothing agreed yet, say so, and that `/unbranch:import`
   drafts its first picture from this repository and everything else this
   session can reach, for the developer to send on the web.

End with a line saying how many documents were linked, skipped and left
unlinked.
