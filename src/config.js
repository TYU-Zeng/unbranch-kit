import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * The kit's version, which is also its Claude Code plugin's: release-please
 * bumps `package.json` and `.claude-plugin/plugin.json` together.
 */
export const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

/** Where unbranch is served; `--server` points a repository elsewhere (dev). */
export const DEFAULT_SERVER = 'https://api.unbranch.ai';

/** The repository's own binding to a project, committed so the team shares it. */
export const BINDING_FILE = '.unbranch.json';

/** Claude Code's project-scoped MCP config, also committed and shared. */
export const MCP_FILE = '.mcp.json';

/** The name the server goes by in the client: its tools are `mcp__unbranch__*`. */
export const MCP_NAME = 'unbranch';

/**
 * The folder the files belong in: the repository's root, found by walking up
 * to the nearest `.git`, so running from a subfolder writes where Claude Code,
 * opened at the root, looks. Outside a repository, the folder it was run in.
 */
export function projectRoot(cwd) {
  let dir = resolve(cwd);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
}

/**
 * A server address as `https://host[:port][/path]`, without a trailing slash,
 * or an error saying what is wrong with it.
 */
export function normalizeServer(server) {
  if (typeof server !== 'string' || server.trim() === '') {
    throw new Error('the server must be an address like https://api.unbranch.ai');
  }
  let url;
  try {
    url = new URL(server.trim());
  } catch {
    throw new Error(`"${server}" is not an address; use one like https://api.unbranch.ai`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`"${server}" is not an http(s) address`);
  }
  // The address is written into files the team commits: nothing private in
  // it, and nothing after the path for `/mcp` to be appended past.
  if (url.username || url.password) {
    throw new Error('the server address must not carry a username or password');
  }
  if (url.search || url.hash) {
    throw new Error(`"${server}" must not carry a query or a fragment`);
  }
  return url.href.replace(/\/+$/, '');
}

/** The MCP endpoint of a server. */
export function mcpUrl(server) {
  return `${normalizeServer(server)}/mcp`;
}

/**
 * A JSON object from a file, or `undefined` when there is none. A file that
 * exists but does not hold an object is an error the caller reports:
 * overwriting it would throw away what someone wrote there. A leading byte
 * order mark — what Notepad and PowerShell 5 write — is not an error.
 */
export function readJson(dir, file) {
  const path = join(dir, file);
  if (!existsSync(path)) return undefined;
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${file} is not valid JSON (${error.message}); fix or remove it first`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${file} must hold a JSON object; fix or remove it first`);
  }
  return value;
}

export function writeJson(dir, file, value) {
  writeFileSync(join(dir, file), `${JSON.stringify(value, null, 2)}\n`);
}
