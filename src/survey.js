import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { MCP_NAME } from './config.js';

/**
 * What a repository already has before the kit touches it — docs, skills,
 * hooks, MCP servers — so `init` fills only what is missing and `doctor` can
 * say where the kit would clash (`docs/developer-kit.md`, *Living beside what
 * is already there*). It only reads. From `~/.claude.json` it takes server
 * names and addresses and nothing else: that file can hold keys and headers,
 * and none of them is ever read into a result.
 */
export function survey(root, home) {
  return {
    docs: standardDocs(root),
    otherDocDirs: otherDocDirs(root),
    docSync: docSyncCommands(root, home),
    progressSkills: progressSkills(root, home),
    prePush: prePushHooks(root, home),
    claudeMd: claudeMd(root),
    mcp: mcpServers(root, home),
    pluginInstalled: pluginInstalled(root),
    pluginAutoUpdate: pluginAutoUpdate(root),
    pluginCopy: pluginCopy(root, home),
  };
}

const isDir = (path) => existsSync(path) && statSync(path).isDirectory();
const isFile = (path) => existsSync(path) && statSync(path).isFile();
const rel = (root, path) => relative(root, path).split('\\').join('/');
const readText = (path) => readFileSync(path, 'utf8').replace(/^\uFEFF/, '');

/** The docs system's own layout, where it exists. */
function standardDocs(root) {
  const docs = {};
  if (isDir(join(root, 'docs', 'features'))) docs.features = 'docs/features';
  if (isDir(join(root, 'docs', 'codebase'))) docs.codebase = 'docs/codebase';
  if (isFile(join(root, 'docs', 'SNAPSHOT.md'))) docs.snapshot = 'docs/SNAPSHOT.md';
  if (isFile(join(root, 'docs', 'BACKLOG.md'))) docs.backlog = 'docs/BACKLOG.md';
  return docs;
}

const DOC_DIR = /^(docs?|documentation|adrs?|decisions|wiki|features|specs?)$/i;

/** Folders that look like another way of keeping docs, two levels down at most. */
function otherDocDirs(root) {
  const found = [];
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const path = join(dir, entry.name);
      const name = rel(root, path);
      if (DOC_DIR.test(entry.name) && !['docs', 'docs/features', 'docs/codebase'].includes(name)) {
        found.push(name);
      }
      if (depth < 2) walk(path, depth + 1);
    }
  };
  walk(root, 1);
  return found.sort();
}

/**
 * `name` and `description` from a SKILL.md or command file's front matter —
 * a one-line value, or a folded / literal block (`>` or `|`) read from the
 * indented lines that follow it.
 */
function frontMatter(path) {
  try {
    const text = readText(path);
    const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
    const lines = block.split(/\r?\n/);
    const field = (key) => {
      const index = lines.findIndex((line) => line.startsWith(`${key}:`));
      if (index < 0) return '';
      const inline = lines[index].slice(key.length + 1).trim();
      if (!/^[>|][-+]?$/.test(inline)) return inline;
      const folded = [];
      for (const line of lines.slice(index + 1)) {
        if (line.trim() !== '' && !/^\s/.test(line)) break;
        folded.push(line.trim());
      }
      return folded.join(' ').trim();
    };
    return { name: field('name'), description: field('description') };
  } catch {
    return { name: '', description: '' };
  }
}

/** Every skill and command a session here could load: the project's and the user's. */
function skillFiles(root, home) {
  const files = [];
  for (const base of [join(root, '.claude'), home && join(home, '.claude')]) {
    if (!base) continue;
    const skills = join(base, 'skills');
    if (isDir(skills)) {
      for (const name of readdirSync(skills)) {
        const file = join(skills, name, 'SKILL.md');
        if (isFile(file)) files.push({ file, name });
      }
    }
    const commands = join(base, 'commands');
    if (isDir(commands)) {
      for (const name of readdirSync(commands)) {
        if (name.endsWith('.md')) {
          files.push({ file: join(commands, name), name: name.replace(/\.md$/, '') });
        }
      }
    }
  }
  return files.map(({ file, name }) => {
    const meta = frontMatter(file);
    return { file, name: meta.name || name, description: meta.description };
  });
}

const DOC_SYNC = /\bdocsync\b|sync(s|ing)?\b.*\bdocs?\b|\bdocs?\b.*\bsync/i;
const PROGRESS = /\bprogress\b|\bto-?do\b|\broadmap\b|where (the )?work stands|进度|待办/i;

function docSyncCommands(root, home) {
  return skillFiles(root, home)
    .filter((s) => DOC_SYNC.test(s.name) || DOC_SYNC.test(s.description))
    .map((s) => s.file);
}

function progressSkills(root, home) {
  return skillFiles(root, home)
    .filter((s) => PROGRESS.test(s.description) || PROGRESS.test(s.name))
    .map((s) => s.file);
}

/**
 * `core.hooksPath` from the repository's own git config, when it sets one —
 * read from the `[core]` section only, unquoted, and with git's escapes
 * undone (`tools\\hooks` is `tools\hooks`). A global setting in
 * `~/.gitconfig` is not read: it is the person's, not the repository's.
 */
function gitHooksPath(root) {
  let config;
  try {
    config = readText(join(root, '.git', 'config'));
  } catch {
    return undefined;
  }
  let inCore = false;
  for (const line of config.split(/\r?\n/)) {
    const section = /^\s*\[([^\]\s"]+)/.exec(line);
    if (section) {
      inCore = section[1].toLowerCase() === 'core';
      continue;
    }
    if (!inCore) continue;
    const match = /^\s*hookspath\s*=\s*(.*?)\s*$/i.exec(line);
    if (!match) continue;
    let value = match[1];
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\(.)/g, '$1');
    return value === '' ? undefined : value;
  }
  return undefined;
}

/** Anything that already runs before a push; the kit never overwrites one. */
function prePushHooks(root, home) {
  const hooks = [];
  const seen = new Set();
  const add = (dir, label) => {
    const file = join(dir, 'pre-push');
    const key = resolve(file).toLowerCase();
    if (!seen.has(key) && isFile(file)) {
      seen.add(key);
      hooks.push(label);
    }
  };
  add(join(root, '.git', 'hooks'), '.git/hooks/pre-push');
  const hooksPath = gitHooksPath(root);
  if (hooksPath) {
    const dir = isAbsolute(hooksPath)
      ? hooksPath
      : hooksPath.startsWith('~') && home
        ? join(home, hooksPath.slice(1))
        : join(root, hooksPath);
    const shown = hooksPath.split('\\').join('/').replace(/\/+$/, '');
    add(dir, `${shown}/pre-push`);
  }
  add(join(root, '.husky'), '.husky/pre-push');
  for (const name of ['lefthook.yml', 'lefthook.yaml', '.lefthook.yml']) {
    if (isFile(join(root, name))) hooks.push(name);
  }
  const preCommit = join(root, '.pre-commit-config.yaml');
  if (isFile(preCommit) && /pre-push/.test(readText(preCommit))) {
    hooks.push('.pre-commit-config.yaml');
  }
  return hooks;
}

export const CLAUDE_MD = 'CLAUDE.md';
export const BLOCK_START = '<!-- unbranch -->';
export const BLOCK_END = '<!-- /unbranch -->';

function claudeMd(root) {
  const path = join(root, CLAUDE_MD);
  if (!isFile(path)) return { exists: false, hasBlock: false };
  return { exists: true, hasBlock: readText(path).includes(BLOCK_START) };
}

/** Paths compare case-insensitively only where the file system does. */
const samePath = (a, b) => {
  const norm = (p) => {
    const path = p.split('\\').join('/').replace(/\/+$/, '');
    return process.platform === 'linux' ? path : path.toLowerCase();
  };
  return norm(a) === norm(b);
};

/**
 * The MCP servers Claude Code would load beside the project's `.mcp.json`:
 * the user's (`~/.claude.json` top level) and this project's local ones
 * (`~/.claude.json` under `projects`). Only names and addresses.
 */
function mcpServers(root, home) {
  const result = { local: undefined, user: undefined, others: [] };
  if (!home) return result;
  let config;
  try {
    config = JSON.parse(readText(join(home, '.claude.json')));
  } catch {
    return result;
  }
  const project = Object.entries(config?.projects ?? {}).find(([path]) =>
    samePath(path, root),
  )?.[1];
  const scopes = [
    ['local', project?.mcpServers],
    ['user', config?.mcpServers],
  ];
  for (const [scope, servers] of scopes) {
    if (!servers || typeof servers !== 'object') continue;
    for (const [name, entry] of Object.entries(servers)) {
      const url = typeof entry?.url === 'string' ? entry.url : undefined;
      if (name === MCP_NAME) result[scope] = url ?? '(not an http server)';
      else if (url && /unbranch/i.test(url)) result.others.push({ scope, name, url });
    }
  }
  return result;
}

/** The marketplace this repository publishes, as `.claude-plugin/marketplace.json` names it. */
export const MARKETPLACE_NAME = 'unbranch-kit';
export const PLUGIN_ID = `unbranch@${MARKETPLACE_NAME}`;

/** A project settings file as an object, or `undefined` when absent or unreadable. */
function projectSettings(root, file) {
  try {
    const settings = JSON.parse(readText(join(root, '.claude', file)));
    return settings && typeof settings === 'object' ? settings : undefined;
  } catch {
    return undefined;
  }
}

/** Whether the project's settings enable the kit's plugin. */
function pluginInstalled(root) {
  return ['settings.json', 'settings.local.json'].some(
    (file) => projectSettings(root, file)?.enabledPlugins?.[PLUGIN_ID],
  );
}

/**
 * Whether Claude Code updates the plugin on its own: `autoUpdate` on the
 * marketplace's entry, the local settings first as Claude Code reads them.
 * Unset, it is off for a marketplace like this one, so a release reaches no
 * one who installed an earlier version until they update by hand.
 */
function pluginAutoUpdate(root) {
  for (const file of ['settings.local.json', 'settings.json']) {
    const value = projectSettings(root, file)?.extraKnownMarketplaces?.[MARKETPLACE_NAME]?.autoUpdate;
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

/**
 * The copy of the plugin Claude Code loads here, from its own record
 * (`~/.claude/plugins/installed_plugins.json`): this project's install first,
 * then the user's. Only the version and the scope.
 */
function pluginCopy(root, home) {
  if (!home) return undefined;
  let installs;
  try {
    const record = JSON.parse(readText(join(home, '.claude', 'plugins', 'installed_plugins.json')));
    installs = record?.plugins?.[PLUGIN_ID];
  } catch {
    return undefined;
  }
  if (!Array.isArray(installs)) return undefined;
  const install =
    installs.find((i) => typeof i?.projectPath === 'string' && samePath(i.projectPath, root)) ??
    installs.find((i) => i?.scope === 'user');
  if (typeof install?.version !== 'string') return undefined;
  return { version: install.version, scope: install.scope ?? 'project' };
}
