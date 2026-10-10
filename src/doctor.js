import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  BINDING_FILE,
  MCP_FILE,
  MCP_NAME,
  mcpUrl,
  projectRoot,
  readJson,
  VERSION,
} from './config.js';
import { MARKETPLACE_NAME, PLUGIN_ID, survey } from './survey.js';

/**
 * `unbranch doctor`: says whether this repository is set up, one line per
 * check, with what to do about each one that is not. It reads the files at the
 * repository's root, the MCP servers Claude Code would load beside the
 * project's (names and addresses only), and knocks on the server once; it signs
 * in to nothing, so it can say the server answers, not that you can reach your
 * project — Claude Code's `/mcp` says that.
 *
 * The server keeps no MCP session, so a plain GET is answered 405 by design:
 * any HTTP answer at all means it is up. A `!` line is worth knowing but not a
 * failure: the setup works either way.
 */
export async function doctor({ cwd, home, fetch, log }) {
  const root = projectRoot(cwd);
  const results = [];
  const check = (ok, text, fix) => {
    results.push(ok);
    log(`${ok ? '✓' : '✗'} ${text}${ok || !fix ? '' : `\n    → ${fix}`}`);
  };
  const note = (text, fix) => log(`! ${text}${fix ? `\n    → ${fix}` : ''}`);
  log(`Checking ${root}`);

  let binding;
  let bindingRead = false;
  try {
    binding = readJson(root, BINDING_FILE);
    bindingRead = true;
  } catch (error) {
    check(false, error.message);
  }
  let expected;
  if (bindingRead && binding === undefined) {
    check(false, `${BINDING_FILE} not found`, 'run: npx @unbranch/kit init');
  } else if (binding) {
    try {
      expected = mcpUrl(binding.server);
      check(true, `${BINDING_FILE} names the server ${binding.server}`);
    } catch (error) {
      check(false, `${BINDING_FILE}: ${error.message}`, 'run: npx @unbranch/kit init --server <url>');
    }
    const project =
      typeof binding.project === 'string' ? binding.project.trim() : '';
    check(
      project !== '',
      project ? `bound to project ${project}` : 'bound to a project',
      'run: npx @unbranch/kit init --project <id>',
    );
  }

  let mcp;
  try {
    mcp = readJson(root, MCP_FILE);
  } catch (error) {
    check(false, error.message);
  }
  const entry = mcp?.mcpServers?.[MCP_NAME];
  const isHttp = entry?.type === 'http' && typeof entry.url === 'string';
  check(isHttp, `${MCP_FILE} has the "${MCP_NAME}" server`, 'run: npx @unbranch/kit init');
  if (isHttp && expected) {
    check(
      entry.url === expected,
      `${MCP_FILE} points at ${expected}`,
      `it points at ${entry.url}; run: npx @unbranch/kit init`,
    );
  }

  const url = isHttp ? entry.url : expected;
  if (url) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      check(true, `server answers at ${url} (HTTP ${response.status})`);
    } catch (error) {
      check(false, `server does not answer at ${url} (${error.message})`, 'check your network, or the server address');
    }
  }

  // What would clash with the project's server: a local one by the same name
  // wins over `.mcp.json`; another name at an unbranch address is a second
  // set of tools.
  const found = survey(root, home);
  if (found.mcp.local && url && found.mcp.local !== url) {
    check(
      false,
      `a local "${MCP_NAME}" server (${found.mcp.local}) takes precedence over ${MCP_FILE}`,
      `remove it: claude mcp remove ${MCP_NAME} -s local`,
    );
  }
  for (const other of found.mcp.others) {
    note(
      `"${other.name}" (${other.scope}) also points at unbranch (${other.url}) — two sets of tools`,
      `if it is the same server: claude mcp remove ${other.name} -s ${other.scope}`,
    );
  }
  note(
    'a claude.ai connector to unbranch, if you added one, brings its own tools too — keep it on the same server, or turn one off in /mcp',
  );

  // What the kit added beside the connection.
  if (found.pluginInstalled) {
    check(true, 'the unbranch skills are installed for this project');
    // A release reaches an installed copy only through an update; Claude Code
    // runs it on its own only where auto-update is on.
    if (found.pluginAutoUpdate === true) check(true, 'the unbranch skills update on their own');
    else if (found.pluginAutoUpdate === false) {
      note(
        'auto-update is off for the unbranch skills: a release reaches you only when you update',
        `set "autoUpdate": true on "${MARKETPLACE_NAME}" in .claude/settings.json`,
      );
    } else {
      note(
        'the unbranch skills do not update on their own: a release reaches you only when you update',
        'run: npx @unbranch/kit@latest init',
      );
    }
    const copy = found.pluginCopy;
    if (copy && older(copy.version, VERSION)) {
      note(
        `the unbranch skills here are ${copy.version}; ${VERSION} is out`,
        `claude plugin update ${PLUGIN_ID} --scope ${copy.scope}`,
      );
    }
  } else note('the unbranch skills are not installed', 'npx @unbranch/kit init --skills');
  const features = binding?.docs?.features;
  if (typeof features === 'string') {
    check(
      existsSync(join(root, features)),
      `feature documents at ${features}`,
      `fix docs.features in ${BINDING_FILE}, or run: npx @unbranch/kit init`,
    );
  }

  log(results.every(Boolean) ? `All set: ${join(root, BINDING_FILE)}` : 'Not set up yet — see above.');
  return results.every(Boolean) ? 0 : 1;
}

/** Whether version `a` comes before `b`, part by part: 0.2.0 before 0.10.0. */
function older(a, b) {
  const parts = (v) => v.split(/[.+-]/).slice(0, 3).map((p) => Number.parseInt(p, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) {
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  }
  return false;
}
