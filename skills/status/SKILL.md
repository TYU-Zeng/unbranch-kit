---
name: status
description: What waits for the developer in unbranch — proposals in review they have not answered, and work being delivered. Run with /unbranch:status.
disable-model-invocation: true
context: fork
agent: unbranch:reader
---

Say what waits for the developer in unbranch for this repository's project.

1. Read `.unbranch.json` at the repository's root for the project id. If it has
   none, say so and that `npx @unbranch/kit init --project <id>` sets it; stop.
2. Call `read_status` with that `projectId`.
3. Answer in a few lines, in the developer's language:
   - the proposals waiting for their answer, each with its title and link —
     they answer on the web;
   - what is being delivered, by title;
   - or, if nothing waits, say so in one line.

Nothing else: no advice, no summary of the model.
