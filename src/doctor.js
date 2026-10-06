import { join } from 'node:path';
import {
  BINDING_FILE,
  MCP_FILE,
  MCP_NAME,
  mcpUrl,
  projectRoot,
  readJson,
} from './config.js';

/**
 * `unbranch doctor`: says whether this repository is set up, one line per
 * check, with what to do about each one that is not. It reads two files at the
 * repository's root and knocks on the server once; it signs in to nothing, so
 * it can say the server answers, not that you can reach your project — Claude
 * Code's `/mcp` says that.
 *
 * The server keeps no MCP session, so a plain GET is answered 405 by design:
 * any HTTP answer at all means it is up.
 */
export async function doctor({ cwd, fetch, log }) {
  const root = projectRoot(cwd);
  const results = [];
  const check = (ok, text, fix) => {
    results.push(ok);
    log(`${ok ? '✓' : '✗'} ${text}${ok || !fix ? '' : `\n    → ${fix}`}`);
  };
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
    check(false, `${BINDING_FILE} not found`, 'run: npx unbranch init');
  } else if (binding) {
    try {
      expected = mcpUrl(binding.server);
      check(true, `${BINDING_FILE} names the server ${binding.server}`);
    } catch (error) {
      check(false, `${BINDING_FILE}: ${error.message}`, 'run: npx unbranch init --server <url>');
    }
    const project =
      typeof binding.project === 'string' ? binding.project.trim() : '';
    check(
      project !== '',
      project ? `bound to project ${project}` : 'bound to a project',
      'run: npx unbranch init --project <id>',
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
  check(isHttp, `${MCP_FILE} has the "${MCP_NAME}" server`, 'run: npx unbranch init');
  if (isHttp && expected) {
    check(
      entry.url === expected,
      `${MCP_FILE} points at ${expected}`,
      `it points at ${entry.url}; run: npx unbranch init`,
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

  log(results.every(Boolean) ? `All set: ${join(root, BINDING_FILE)}` : 'Not set up yet — see above.');
  return results.every(Boolean) ? 0 : 1;
}
