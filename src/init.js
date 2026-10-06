import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
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
import {
  BLOCK_END,
  BLOCK_START,
  CLAUDE_MD,
  PLUGIN_ID,
  survey,
} from './survey.js';

/** Where the kit's Claude Code plugin is published from: this repository. */
export const MARKETPLACE = 'TYU-Zeng/unbranch-kit';

/**
 * `unbranch init`: binds this repository to an unbranch project, connects
 * Claude Code to the server, and — if the developer says so — installs the
 * kit's skills. It surveys first and lists what the repository already has
 * (docs, skills, hooks, other MCP servers), then fills only what is missing:
 * nothing that exists is overwritten, and each step that is not the
 * connection itself is the developer's yes (`docs/developer-kit.md`).
 *
 * Files it writes, all meant to be committed and none holding a credential:
 * `.unbranch.json` (the binding: project, server, docs map, autoProgress),
 * `.mcp.json` (the server, project-scoped; Claude Code signs in through
 * unbranch on first use), and, with the skills, `.claude/settings.json`
 * (written by Claude Code's own plugin command) and a marked block in
 * CLAUDE.md. Both JSON files are read and checked before anything is written.
 */
export async function init({ cwd, home, options, prompt, log, run }) {
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
  const entry = { type: 'http', url: mcpUrl(server) };

  const found = survey(root, home);
  reportSurvey(found, root, log);

  const yesNo = async (question, fallback) => {
    if (!prompt) return fallback;
    const answer = (await prompt(`${question} ${fallback ? '[Y/n]' : '[y/N]'} `))
      .trim()
      .toLowerCase();
    if (answer === '') return fallback;
    return answer === 'y' || answer === 'yes';
  };

  // The project.
  const saved =
    typeof existing.project === 'string' ? existing.project.trim() : '';
  let project = options.project?.trim() || saved || undefined;
  if (!project && prompt) {
    const answer = await prompt(
      'unbranch project id (press Enter to set it later): ',
    );
    project = answer.trim() || undefined;
  }

  // Where the docs are: what was saved, then the standard layout found, then
  // — when there is none — the developer's pick among the folders found.
  const docs = { ...found.docs, ...(isObject(existing.docs) ? existing.docs : {}) };
  if (!docs.features && found.otherDocDirs.length > 0 && prompt) {
    const answer = (
      await prompt(
        `Which folder holds your feature documents? (${found.otherDocDirs.join(', ')}; Enter to skip) `,
      )
    ).trim();
    const picked = answer.split('\\').join('/').replace(/\/+$/, '');
    const inside = picked !== '' && !isAbsolute(picked) && !picked.split('/').includes('..');
    if (inside && isDir(join(root, picked))) docs.features = picked;
    else if (answer) log(`  "${answer}" is not a folder inside ${root}; feature documents left unset.`);
  }

  // Another skill already answering progress questions: ask before ours does too.
  let autoProgress =
    typeof existing.autoProgress === 'boolean' ? existing.autoProgress : undefined;
  if (autoProgress === undefined && found.progressSkills.length > 0 && prompt) {
    autoProgress = await yesNo(
      'Another skill already answers progress questions. Should /unbranch:progress answer them on its own too?',
      false,
    );
  }

  // The skills: asked, unless a flag says or they are already there. Asking
  // nothing (`--yes`) installs nothing: that takes `--skills`.
  let wantSkills = false;
  if (options['no-skills']) wantSkills = false;
  else if (options.skills) wantSkills = true;
  else if (found.pluginInstalled || !prompt) wantSkills = false;
  else
    wantSkills = await yesNo(
      'Install the unbranch skills for Claude Code (/unbranch:progress, /unbranch:status, /unbranch:link)?',
      true,
    );

  const { project: _blank, docs: _docs, autoProgress: _auto, ...kept } = existing;
  writeJson(root, BINDING_FILE, {
    ...kept,
    ...(project ? { project } : {}),
    ...(options.name ? { name: options.name.trim() } : {}),
    server,
    ...(Object.keys(docs).length > 0 ? { docs } : {}),
    ...(autoProgress !== undefined ? { autoProgress } : {}),
  });
  const before = mcp.mcpServers?.[MCP_NAME];
  writeJson(root, MCP_FILE, {
    ...mcp,
    mcpServers: { ...(mcp.mcpServers ?? {}), [MCP_NAME]: entry },
  });

  log('');
  log(`Wrote ${join(root, BINDING_FILE)} — ${project ? `project ${project}` : 'no project yet'}, server ${server}`);
  log(`${before ? 'Updated' : 'Added'} "${MCP_NAME}" in ${join(root, MCP_FILE)} → ${entry.url}`);
  warnAboutServers(found.mcp, entry.url, log);

  let skills = found.pluginInstalled;
  let failed = false;
  if (wantSkills) {
    skills = installPlugin(run, root, log);
    failed = !skills;
  }
  if (skills && prompt) {
    const note = await yesNo(
      found.claudeMd.exists
        ? `Add a short note on the unbranch commands to ${CLAUDE_MD}?`
        : `Create ${CLAUDE_MD} with a short note on the unbranch commands?`,
      found.claudeMd.exists,
    );
    if (note) writeClaudeBlock(root, project, options.name ?? existing.name, log);
  }

  log('');
  log('Next:');
  log(`  1. Open Claude Code in ${root} and allow the "unbranch" server when asked.`);
  log('  2. Run /mcp, choose unbranch and sign in — your browser opens unbranch to approve.');
  let step = 3;
  if (!project) {
    log(`  ${step}. Ask Claude "which unbranch projects can I reach?", then run`);
    log('     npx @unbranch/kit init --project <id>');
    step += 1;
  }
  if (skills) {
    log(`  ${step}. Run /unbranch:status, or ask "where does the work stand?"`);
    if (docs.features) log(`     /unbranch:link links ${docs.features} to the agreed capabilities.`);
  }
  log(`Commit ${BINDING_FILE}, ${MCP_FILE}${skills ? ' and .claude/settings.json' : ''} so your team shares the setup.`);
  return failed ? 1 : 0;
}

const isObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isDir = (path) => existsSync(path) && statSync(path).isDirectory();

/** What the repository already has, in a few lines; nothing when it has none. */
function reportSurvey(found, root, log) {
  const lines = [];
  const docs = Object.values(found.docs);
  if (docs.length > 0) lines.push(`docs: ${docs.join(', ')}`);
  if (found.otherDocDirs.length > 0) lines.push(`other doc folders: ${found.otherDocDirs.join(', ')}`);
  if (found.docSync.length > 0) lines.push(`a doc-sync command already: ${found.docSync.length} found — the kit adds none`);
  if (found.progressSkills.length > 0) lines.push(`skills about progress or to-dos: ${found.progressSkills.length}`);
  if (found.prePush.length > 0) lines.push(`pre-push hooks: ${found.prePush.join(', ')} — left as they are`);
  if (found.pluginInstalled) lines.push('the unbranch skills are already installed');
  if (lines.length === 0) return;
  log(`Found in ${root}:`);
  for (const line of lines) log(`  - ${line}`);
}

/**
 * A server that would clash with the project's: one named `unbranch` in the
 * local scope wins over `.mcp.json` (Claude Code's precedence is local,
 * project, user), and one under another name at an unbranch address makes a
 * second set of tools.
 */
function warnAboutServers(servers, url, log) {
  if (servers.local && servers.local !== url) {
    log(`! A local "${MCP_NAME}" server (${servers.local}) takes precedence over this project's.`);
    log(`  Remove it to use ${url}: claude mcp remove ${MCP_NAME} -s local`);
  }
  for (const other of servers.others) {
    log(`! "${other.name}" (${other.scope}) also points at unbranch (${other.url}) — the agent would see two sets of tools.`);
    log(`  Remove it if it is the same server: claude mcp remove ${other.name} -s ${other.scope}`);
  }
}

/**
 * The plugin, through Claude Code's own commands at project scope, so it is
 * written into `.claude/settings.json` and shared with the team. Without the
 * `claude` command, the two commands are printed instead.
 */
function installPlugin(run, root, log) {
  const steps = [
    ['plugin', 'marketplace', 'add', MARKETPLACE, '--scope', 'project'],
    ['plugin', 'install', PLUGIN_ID, '--scope', 'project'],
  ];
  for (const args of steps) {
    const result = run('claude', args, { cwd: root });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    // Through a shell (Windows), a missing command is an exit code and a
    // sentence, not ENOENT.
    const notFound =
      result.error?.code === 'ENOENT' ||
      result.status === 127 ||
      result.status === 9009 ||
      /is not recognized as an internal or external command|command not found/i.test(output);
    if (notFound) {
      log('! Claude Code\'s "claude" command was not found. Install the skills by hand:');
      for (const manual of steps) log(`  claude ${manual.join(' ')}`);
      return false;
    }
    if (result.error?.code === 'ETIMEDOUT') {
      log(`! "claude ${args.join(' ')}" took too long and was stopped. Run it by hand:`);
      for (const manual of steps) log(`  claude ${manual.join(' ')}`);
      return false;
    }
    if (result.status !== 0 && !/already/i.test(output)) {
      log(`! "claude ${args.join(' ')}" failed:`);
      log(`  ${output.trim().split('\n').slice(-3).join('\n  ')}`);
      return false;
    }
  }
  log(`Installed the unbranch skills (${PLUGIN_ID}) for this project.`);
  return true;
}

/**
 * A fact, not an instruction: which project this repository is and the
 * commands that check it — between markers, so a re-run replaces only this
 * and `uninstall` can take it out. Nothing else in CLAUDE.md is touched.
 */
function writeClaudeBlock(root, project, name, log) {
  const path = join(root, CLAUDE_MD);
  const label = name ? `${name} (${project ?? 'no project yet'})` : project ?? 'not bound to a project yet';
  const block = [
    BLOCK_START,
    `This repository builds the unbranch project ${label}; the binding is \`.unbranch.json\`.`,
    'In Claude Code, `/unbranch:progress` says where the work stands against what the team agreed,',
    '`/unbranch:status` what waits for you, and `/unbranch:link` links feature docs to agreed capabilities.',
    BLOCK_END,
  ].join('\n');
  const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const start = current.indexOf(BLOCK_START);
  const end = current.indexOf(BLOCK_END);
  const count = (marker) => current.split(marker).length - 1;
  const paired = start < 0 ? count(BLOCK_END) === 0 : count(BLOCK_START) === 1 && count(BLOCK_END) === 1 && end > start;
  if (!paired) {
    log(`! ${path} has an unbranch marker without its pair; left as it is.`);
    log(`  Remove the ${BLOCK_START} … ${BLOCK_END} lines by hand and run init again to add the note.`);
    return;
  }
  const next =
    start >= 0 && end > start
      ? current.slice(0, start) + block + current.slice(end + BLOCK_END.length)
      : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${current ? '\n' : ''}${block}\n`;
  writeFileSync(path, next);
  log(`${start >= 0 ? 'Updated' : 'Added'} the unbranch note in ${path}`);
}
