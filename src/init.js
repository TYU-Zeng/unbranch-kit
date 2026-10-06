import { join } from 'node:path';
import {
  BINDING_FILE,
  DEFAULT_SERVER,
  MCP_FILE,
  MCP_NAME,
  mcpUrl,
  normalizeServer,
  projectRoot,
  readJson,
  writeJson,
} from './config.js';

/**
 * `unbranch init`: binds this repository to an unbranch project and connects
 * Claude Code to the server. Two files at the repository's root, both meant
 * to be committed, neither holding a credential:
 *
 * - `.unbranch.json` — which project the repository builds, and the server.
 * - `.mcp.json` — the server as a project-scoped MCP server. Claude Code asks
 *   once before using it and signs in through unbranch's own consent page
 *   (OAuth), so no key is ever written to disk.
 *
 * It merges: other MCP servers in `.mcp.json` and anything else already in
 * `.unbranch.json` are kept. Both files are read and checked before either is
 * written, so a refusal leaves both as they were.
 */
export async function init({ cwd, options, prompt, log }) {
  const root = projectRoot(cwd);
  const existing = readJson(root, BINDING_FILE) ?? {};
  const mcp = readJson(root, MCP_FILE) ?? {};
  const server = normalizeServer(
    options.server ?? existing.server ?? DEFAULT_SERVER,
  );
  if (
    mcp.mcpServers !== undefined &&
    (mcp.mcpServers === null ||
      typeof mcp.mcpServers !== 'object' ||
      Array.isArray(mcp.mcpServers))
  ) {
    throw new Error(`${MCP_FILE}: "mcpServers" must be an object; fix or remove it first`);
  }

  const saved =
    typeof existing.project === 'string' ? existing.project.trim() : '';
  let project = options.project?.trim() || saved || undefined;
  if (!project && prompt) {
    const answer = await prompt(
      'unbranch project id (press Enter to set it later): ',
    );
    project = answer.trim() || undefined;
  }

  const before = mcp.mcpServers?.[MCP_NAME];
  const entry = { type: 'http', url: mcpUrl(server) };

  const { project: _blank, ...kept } = existing;
  writeJson(root, BINDING_FILE, {
    ...kept,
    ...(project ? { project } : {}),
    ...(options.name ? { name: options.name.trim() } : {}),
    server,
  });
  writeJson(root, MCP_FILE, {
    ...mcp,
    mcpServers: { ...(mcp.mcpServers ?? {}), [MCP_NAME]: entry },
  });

  log(`Wrote ${join(root, BINDING_FILE)} — ${project ? `project ${project}` : 'no project yet'}, server ${server}`);
  log(
    `${before ? 'Updated' : 'Added'} "${MCP_NAME}" in ${join(root, MCP_FILE)} → ${entry.url}`,
  );
  log('');
  log('Next:');
  log(`  1. Open Claude Code in ${root} and allow the "unbranch" server when asked.`);
  log('  2. Run /mcp, choose unbranch and sign in — your browser opens unbranch to approve.');
  if (!project) {
    log('  3. Ask Claude "which unbranch projects can I reach?", then run');
    log('     npx unbranch init --project <id>');
  }
  log(`Commit ${BINDING_FILE} and ${MCP_FILE} so your team shares the connection.`);
  return 0;
}
