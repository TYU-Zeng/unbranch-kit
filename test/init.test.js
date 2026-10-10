import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { projectRoot } from '../src/config.js';
import {
  cli,
  fakeRun,
  guardRepoRoot,
  noPrompt,
  projectKey,
  read,
  readText,
  scripted,
  tempDir,
  write,
} from './helpers.js';

guardRepoRoot();

/** `unbranch init` in `dir`, with a temp home and a fake `claude`. */
const init = (t, dir, args = [], io = {}) => cli(t, ['init', ...args], { cwd: dir, ...io });

const PROJECT_Q = /project id/;
const FEATURES_Q = /Which folder holds your feature documents\?/;
const PROGRESS_Q = /Another skill already answers progress questions/;
const SKILLS_Q = /Install the unbranch skills/;
const CREATE_MD_Q = /^Create CLAUDE\.md with a short note/;
const ADD_MD_Q = /^Add a short note on the unbranch commands to CLAUDE\.md\?/;

const MARKETPLACE_ADD = ['plugin', 'marketplace', 'add', 'TYU-Zeng/unbranch-kit', '--scope', 'project'];
const PLUGIN_INSTALL = ['plugin', 'install', 'unbranch@unbranch-kit', '--scope', 'project'];

const PROGRESS_SKILL = `---\nname: todo\ndescription: Shows the project's progress and what is next.\n---\nBody.\n`;

// ---------------------------------------------------------------- the files

test('init in an empty folder writes both files with the default server', async (t) => {
  const dir = tempDir(t);
  const { code, out } = await init(t, dir, ['--yes']);
  assert.equal(code, 0);
  assert.deepEqual(read(dir, '.unbranch.json'), { server: 'https://api.unbranch.ai' });
  assert.deepEqual(read(dir, '.mcp.json'), {
    mcpServers: { unbranch: { type: 'http', url: 'https://api.unbranch.ai/mcp' } },
  });
  assert.ok(out.includes(`Wrote ${join(dir, '.unbranch.json')} — no project yet`), out);
  assert.ok(
    out.includes(`Added "unbranch" in ${join(dir, '.mcp.json')} → https://api.unbranch.ai/mcp`),
    out,
  );
  assert.match(out, /npx @unbranch\/kit init --project <id>/);
  assert.doesNotMatch(out, /Found in/, 'an empty folder has nothing to list');
  assert.equal(existsSync(join(dir, 'CLAUDE.md')), false);
});

test('init writes JSON with two-space indent and a trailing newline', async (t) => {
  const dir = tempDir(t);
  await init(t, dir, ['--yes']);
  assert.equal(readText(dir, '.unbranch.json'), '{\n  "server": "https://api.unbranch.ai"\n}\n');
});

test('init takes --project, --name and --server', async (t) => {
  const dir = tempDir(t);
  const { code, out } = await init(t, dir, [
    '--yes',
    '--project',
    'p1',
    '--name=e-menu',
    '--server',
    'https://api-dev.unbranch.ai',
  ]);
  assert.equal(code, 0);
  assert.deepEqual(read(dir, '.unbranch.json'), {
    project: 'p1',
    name: 'e-menu',
    server: 'https://api-dev.unbranch.ai',
  });
  assert.equal(read(dir, '.mcp.json').mcpServers.unbranch.url, 'https://api-dev.unbranch.ai/mcp');
  assert.match(out, /project p1/);
  assert.doesNotMatch(out, /init --project <id>/);
});

test('init trims --project and --name', async (t) => {
  const dir = tempDir(t);
  await init(t, dir, ['--yes', '--project', '  p1 ', '--name= e-menu ']);
  const binding = read(dir, '.unbranch.json');
  assert.equal(binding.project, 'p1');
  assert.equal(binding.name, 'e-menu');
});

test('init normalises trailing slashes in --server', async (t) => {
  const dir = tempDir(t);
  await init(t, dir, ['--yes', '--server', 'https://api-dev.unbranch.ai//']);
  assert.equal(read(dir, '.unbranch.json').server, 'https://api-dev.unbranch.ai');
  assert.equal(read(dir, '.mcp.json').mcpServers.unbranch.url, 'https://api-dev.unbranch.ai/mcp');
});

test('init keeps a path in --server without its trailing slash', async (t) => {
  const dir = tempDir(t);
  await init(t, dir, ['--yes', '--server', 'http://localhost:3000/base/']);
  assert.equal(read(dir, '.unbranch.json').server, 'http://localhost:3000/base');
  assert.equal(read(dir, '.mcp.json').mcpServers.unbranch.url, 'http://localhost:3000/base/mcp');
});

for (const [server, message] of [
  ['foo', /"foo" is not an address/],
  ['ftp://files.example', /"ftp:\/\/files\.example" is not an http\(s\) address/],
  ['https://user:pw@api.unbranch.ai', /must not carry a username or password/],
  ['https://user@api.unbranch.ai', /must not carry a username or password/],
  ['https://api.unbranch.ai/?a=b', /must not carry a query or a fragment/],
  ['https://api.unbranch.ai/#frag', /must not carry a query or a fragment/],
]) {
  test(`init refuses --server ${server} and writes nothing`, async (t) => {
    const dir = tempDir(t);
    const { code, out, runs } = await init(t, dir, ['--yes', '--skills', '--server', server]);
    assert.equal(code, 1);
    assert.match(out, message);
    assert.equal(existsSync(join(dir, '.unbranch.json')), false);
    assert.equal(existsSync(join(dir, '.mcp.json')), false);
    assert.equal(runs.length, 0);
  });
}

test('init refuses a non-string server in .unbranch.json and leaves it untouched', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', '{"server":42}');
  const { code, out } = await init(t, dir, ['--yes']);
  assert.equal(code, 1);
  assert.match(out, /the server must be an address/);
  assert.equal(readText(dir, '.unbranch.json'), '{"server":42}');
  assert.equal(existsSync(join(dir, '.mcp.json')), false);
});

// ---------------------------------------------------------------- the project

test('init asks for a project when interactive and uses the trimmed answer', async (t) => {
  const dir = tempDir(t);
  const prompt = scripted([PROJECT_Q, '  p42  '], [SKILLS_Q, 'n']);
  const { code } = await init(t, dir, [], { isTTY: true, prompt });
  assert.equal(code, 0);
  assert.equal(prompt.questions.filter((q) => PROJECT_Q.test(q)).length, 1);
  assert.match(prompt.questions[0], /press Enter to set it later/);
  assert.equal(read(dir, '.unbranch.json').project, 'p42');
});

test('init leaves the project unset when the prompt is answered with Enter', async (t) => {
  const dir = tempDir(t);
  const prompt = scripted([/./, '']);
  const { code, out, runs } = await init(t, dir, [], { isTTY: true, prompt });
  assert.equal(code, 0);
  assert.equal('project' in read(dir, '.unbranch.json'), false);
  assert.match(out, /no project yet/);
  // Enter takes each default: skills yes [Y/n], CLAUDE.md no [y/N].
  assert.deepEqual(runs.map((r) => r.args), [MARKETPLACE_ADD, PLUGIN_INSTALL]);
  assert.equal(existsSync(join(dir, 'CLAUDE.md')), false);
});

test('init does not ask for a project when --project is given', async (t) => {
  const dir = tempDir(t);
  const prompt = scripted([SKILLS_Q, 'n']);
  const { code } = await init(t, dir, ['--project', 'p1'], { isTTY: true, prompt });
  assert.equal(code, 0);
  assert.equal(prompt.questions.length, 1);
  assert.equal(read(dir, '.unbranch.json').project, 'p1');
});

test('init does not ask for a project when the binding already names one', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: 'p1', server: 'https://api.unbranch.ai' });
  const prompt = scripted([SKILLS_Q, 'n']);
  const { code } = await init(t, dir, [], { isTTY: true, prompt });
  assert.equal(code, 0);
  assert.equal(prompt.questions.length, 1);
  assert.equal(read(dir, '.unbranch.json').project, 'p1');
});

test('init asks again when the saved project is only spaces', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: '   ', server: 'https://api.unbranch.ai' });
  const prompt = scripted([PROJECT_Q, 'p7'], [SKILLS_Q, 'n']);
  const { code } = await init(t, dir, [], { isTTY: true, prompt });
  assert.equal(code, 0);
  assert.equal(read(dir, '.unbranch.json').project, 'p7');
});

test('init --yes treats a saved project of only spaces as none and drops it', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: '   ', server: 'https://api.unbranch.ai' });
  const { code, out } = await init(t, dir, ['--yes']);
  assert.equal(code, 0);
  assert.match(out, /no project yet/);
  assert.match(out, /npx @unbranch\/kit init --project <id>/);
  assert.equal('project' in read(dir, '.unbranch.json'), false);
});

test('init --yes and -y never prompt, even on a terminal', async (t) => {
  for (const flag of ['--yes', '-y']) {
    const dir = tempDir(t);
    const { code } = await init(t, dir, [flag], { isTTY: true, prompt: noPrompt });
    assert.equal(code, 0);
    assert.equal('project' in read(dir, '.unbranch.json'), false);
  }
});

test('init does not prompt without a terminal', async (t) => {
  const dir = tempDir(t);
  const { code } = await init(t, dir, [], { isTTY: false, prompt: noPrompt });
  assert.equal(code, 0);
  assert.equal('project' in read(dir, '.unbranch.json'), false);
});

test('init --yes and -y install no skills without --skills', async (t) => {
  for (const flag of ['--yes', '-y']) {
    const { code, runs, out } = await init(t, tempDir(t), [flag], { isTTY: true, prompt: noPrompt });
    assert.equal(code, 0);
    assert.equal(runs.length, 0, flag);
    assert.doesNotMatch(out, /Installed the unbranch skills/);
    assert.match(out, /Commit \.unbranch\.json, \.mcp\.json so your team/);
  }
});

test('init without a terminal installs no skills without --skills', async (t) => {
  const { code, runs } = await init(t, tempDir(t), [], { isTTY: false, prompt: noPrompt });
  assert.equal(code, 0);
  assert.equal(runs.length, 0);
});

test('init without a terminal installs the skills with --skills', async (t) => {
  const { code, runs } = await init(t, tempDir(t), ['--skills'], { isTTY: false, prompt: noPrompt });
  assert.equal(code, 0);
  assert.equal(runs.length, 2);
});

// ---------------------------------------------------------------- re-runs and merging

test('re-running init keeps the project, the server and other keys', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', {
    project: 'p1',
    name: 'e-menu',
    server: 'https://api-dev.unbranch.ai',
    extra: { keep: true },
  });
  const { code } = await init(t, dir, ['--yes']);
  assert.equal(code, 0);
  assert.deepEqual(read(dir, '.unbranch.json'), {
    project: 'p1',
    name: 'e-menu',
    server: 'https://api-dev.unbranch.ai',
    extra: { keep: true },
  });
  assert.equal(read(dir, '.mcp.json').mcpServers.unbranch.url, 'https://api-dev.unbranch.ai/mcp');
});

test('re-running init with --server replaces only the server', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: 'p1', server: 'https://api-dev.unbranch.ai' });
  await init(t, dir, ['--yes', '--server', 'https://api.unbranch.ai']);
  assert.deepEqual(read(dir, '.unbranch.json'), {
    project: 'p1',
    server: 'https://api.unbranch.ai',
  });
});

test('re-running init with --project replaces the project', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: 'p1', server: 'https://api.unbranch.ai' });
  await init(t, dir, ['--yes', '--project', 'p2']);
  assert.equal(read(dir, '.unbranch.json').project, 'p2');
});

test('init keeps other MCP servers and other keys in .mcp.json', async (t) => {
  const dir = tempDir(t);
  const other = { command: 'npx', args: ['-y', 'some-server'] };
  write(dir, '.mcp.json', {
    mcpServers: {
      other,
      unbranch: { type: 'http', url: 'https://old.example/mcp', headers: { x: '1' } },
    },
    note: 'kept',
  });
  const { out } = await init(t, dir, ['--yes']);
  assert.deepEqual(read(dir, '.mcp.json'), {
    mcpServers: {
      other,
      unbranch: { type: 'http', url: 'https://api.unbranch.ai/mcp' },
    },
    note: 'kept',
  });
  assert.ok(out.includes(`Updated "unbranch" in ${join(dir, '.mcp.json')}`), out);
});

test('init reads files that start with a byte order mark', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', `\uFEFF${JSON.stringify({ project: 'p1' })}`);
  write(dir, '.mcp.json', `\uFEFF${JSON.stringify({ mcpServers: { other: { command: 'x' } } })}`);
  const { code, out } = await init(t, dir, ['--yes']);
  assert.equal(code, 0, out);
  assert.deepEqual(read(dir, '.unbranch.json'), { project: 'p1', server: 'https://api.unbranch.ai' });
  assert.deepEqual(Object.keys(read(dir, '.mcp.json').mcpServers), ['other', 'unbranch']);
});

// ---------------------------------------------------------------- refusals

test('init refuses an invalid .unbranch.json and leaves both files untouched', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', '{ "project": "p1", ');
  const { code, out } = await init(t, dir, ['--yes']);
  assert.equal(code, 1);
  assert.match(out, /\.unbranch\.json is not valid JSON/);
  assert.equal(readText(dir, '.unbranch.json'), '{ "project": "p1", ');
  assert.equal(existsSync(join(dir, '.mcp.json')), false);
});

test('init refuses an invalid .mcp.json and writes neither file', async (t) => {
  const dir = tempDir(t);
  write(dir, '.mcp.json', '{ mcpServers: {} }');
  const { code, out } = await init(t, dir, ['--yes']);
  assert.equal(code, 1);
  assert.match(out, /\.mcp\.json is not valid JSON/);
  assert.equal(readText(dir, '.mcp.json'), '{ mcpServers: {} }');
  assert.equal(existsSync(join(dir, '.unbranch.json')), false);
});

for (const content of ['null', '[]', '42', '"text"']) {
  test(`init refuses a .unbranch.json holding ${content} and leaves it untouched`, async (t) => {
    const dir = tempDir(t);
    write(dir, '.unbranch.json', content);
    const { code, out } = await init(t, dir, ['--yes']);
    assert.equal(code, 1);
    assert.match(out, /\.unbranch\.json must hold a JSON object/);
    assert.equal(readText(dir, '.unbranch.json'), content);
    assert.equal(existsSync(join(dir, '.mcp.json')), false);
  });
}

test('init refuses a .mcp.json holding an array and writes neither file', async (t) => {
  const dir = tempDir(t);
  write(dir, '.mcp.json', '[]');
  const { code, out } = await init(t, dir, ['--yes']);
  assert.equal(code, 1);
  assert.match(out, /\.mcp\.json must hold a JSON object/);
  assert.equal(readText(dir, '.mcp.json'), '[]');
  assert.equal(existsSync(join(dir, '.unbranch.json')), false);
});

for (const [label, content] of [
  ['a string', '{"mcpServers":"unbranch"}'],
  ['an array', '{"mcpServers":[]}'],
  ['null', '{"mcpServers":null}'],
]) {
  test(`init refuses a .mcp.json whose mcpServers is ${label}, before asking anything`, async (t) => {
    const dir = tempDir(t);
    write(dir, '.mcp.json', content);
    const { code, out, runs } = await init(t, dir, [], { isTTY: true, prompt: noPrompt });
    assert.equal(code, 1);
    assert.match(out, /\.mcp\.json: "mcpServers" must be an object/);
    assert.equal(readText(dir, '.mcp.json'), content);
    assert.equal(existsSync(join(dir, '.unbranch.json')), false);
    assert.equal(runs.length, 0);
  });
}

// ---------------------------------------------------------------- the repository's root

test('init run from a subfolder writes at the root that holds .git', async (t) => {
  const root = tempDir(t);
  mkdirSync(join(root, '.git'));
  const sub = join(root, 'packages', 'web');
  mkdirSync(sub, { recursive: true });
  const { code, out } = await init(t, sub, ['--yes']);
  assert.equal(code, 0);
  assert.equal(read(root, '.unbranch.json').server, 'https://api.unbranch.ai');
  assert.equal(read(root, '.mcp.json').mcpServers.unbranch.type, 'http');
  assert.equal(existsSync(join(sub, '.unbranch.json')), false);
  assert.equal(existsSync(join(sub, '.mcp.json')), false);
  assert.ok(out.includes(`Wrote ${join(root, '.unbranch.json')}`), out);
  assert.ok(out.includes(`1. Open Claude Code in ${root} and allow the "unbranch" server`), out);
});

test('init finds the root when .git is a file (worktree or submodule)', async (t) => {
  const root = tempDir(t);
  write(root, '.git', 'gitdir: ../elsewhere\n');
  const sub = join(root, 'src');
  mkdirSync(sub);
  await init(t, sub, ['--yes']);
  assert.equal(existsSync(join(root, '.unbranch.json')), true);
  assert.equal(existsSync(join(sub, '.unbranch.json')), false);
});

test('init outside any repository writes in the folder it was run in', async (t) => {
  const dir = tempDir(t);
  if (projectRoot(dir) !== dir) {
    t.skip('the temp directory sits inside a git repository');
    return;
  }
  const sub = join(dir, 'a', 'b');
  mkdirSync(sub, { recursive: true });
  const { code } = await init(t, sub, ['--yes']);
  assert.equal(code, 0);
  assert.equal(existsSync(join(sub, '.unbranch.json')), true);
  assert.equal(existsSync(join(sub, '.mcp.json')), true);
  assert.equal(existsSync(join(dir, '.unbranch.json')), false);
});

// ---------------------------------------------------------------- what it finds

test('init lists what the repository already has and saves the standard docs', async (t) => {
  const dir = tempDir(t);
  const home = tempDir(t);
  mkdirSync(join(dir, 'docs', 'features'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'codebase'), { recursive: true });
  write(dir, 'docs/SNAPSHOT.md', '# snapshot');
  write(dir, '.husky/pre-push', 'npm test');
  write(dir, '.claude/commands/docsync.md', '---\ndescription: Sync docs with the code\n---\n');
  write(home, '.claude/skills/todo/SKILL.md', PROGRESS_SKILL);
  const { code, out } = await init(t, dir, ['--yes'], { home });
  assert.equal(code, 0);
  assert.ok(out.includes(`Found in ${dir}:`), out);
  assert.match(out, /- docs: docs\/features, docs\/codebase, docs\/SNAPSHOT\.md/);
  assert.match(out, /- a doc-sync command already: 1 found — the kit adds none/);
  assert.match(out, /- skills about progress or to-dos: 1/);
  assert.match(out, /- pre-push hooks: \.husky\/pre-push — left as they are/);
  assert.deepEqual(read(dir, '.unbranch.json').docs, {
    features: 'docs/features',
    codebase: 'docs/codebase',
    snapshot: 'docs/SNAPSHOT.md',
  });
});

test('init asks which folder holds the feature documents when there is no docs/features', async (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, 'documentation'));
  mkdirSync(join(dir, 'wiki'));
  const prompt = scripted([PROJECT_Q, ''], [FEATURES_Q, ' wiki '], [SKILLS_Q, 'n']);
  const { code, out } = await init(t, dir, [], { isTTY: true, prompt });
  assert.equal(code, 0);
  assert.match(out, /other doc folders: documentation, wiki/);
  const question = prompt.questions.find((q) => FEATURES_Q.test(q));
  assert.match(question, /\(documentation, wiki; Enter to skip\)/);
  assert.deepEqual(read(dir, '.unbranch.json').docs, { features: 'wiki' });
});

test('init saves a nested feature folder with forward slashes', async (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, 'docs', 'specs'), { recursive: true });
  const prompt = scripted([PROJECT_Q, ''], [FEATURES_Q, 'docs\\specs'], [SKILLS_Q, 'n']);
  await init(t, dir, [], { isTTY: true, prompt });
  assert.equal(read(dir, '.unbranch.json').docs.features, 'docs/specs');
});

test('init skips the feature folder on Enter, silently', async (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, 'wiki'));
  const prompt = scripted([PROJECT_Q, ''], [FEATURES_Q, '  '], [SKILLS_Q, 'n']);
  const { out } = await init(t, dir, [], { isTTY: true, prompt });
  assert.equal('docs' in read(dir, '.unbranch.json'), false);
  assert.doesNotMatch(out, /feature documents left unset/);
});

test('init accepts a feature folder given with a trailing slash', async (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, 'wiki'));
  const prompt = scripted([PROJECT_Q, ''], [FEATURES_Q, 'wiki/'], [SKILLS_Q, 'n']);
  await init(t, dir, [], { isTTY: true, prompt });
  assert.equal(read(dir, '.unbranch.json').docs.features, 'wiki');
});

test('init refuses a feature folder that is missing, a file, outside the repository or absolute', async (t) => {
  const outside = tempDir(t);
  for (const answer of ['nowhere', 'README.md', '../elsewhere', 'wiki/../../elsewhere', '..', outside]) {
    const parent = tempDir(t);
    mkdirSync(join(parent, 'elsewhere'));
    const dir = join(parent, 'repo');
    mkdirSync(join(dir, '.git'), { recursive: true });
    mkdirSync(join(dir, 'wiki'));
    write(dir, 'README.md', '# readme');
    const prompt = scripted([PROJECT_Q, ''], [FEATURES_Q, answer], [SKILLS_Q, 'n']);
    const { code, out } = await init(t, dir, [], { isTTY: true, prompt });
    assert.equal(code, 0);
    assert.equal('docs' in read(dir, '.unbranch.json'), false, `answer "${answer}"`);
    assert.ok(
      out.includes(`"${answer}" is not a folder inside ${dir}; feature documents left unset.`),
      `answer "${answer}":\n${out}`,
    );
  }
});

test('init does not ask for a feature folder when docs/features exists or one is saved', async (t) => {
  const withStandard = tempDir(t);
  mkdirSync(join(withStandard, 'docs', 'features'), { recursive: true });
  mkdirSync(join(withStandard, 'wiki'));
  const prompt = scripted([PROJECT_Q, ''], [SKILLS_Q, 'n']);
  await init(t, withStandard, [], { isTTY: true, prompt });
  assert.equal(prompt.questions.some((q) => FEATURES_Q.test(q)), false);

  const withSaved = tempDir(t);
  mkdirSync(join(withSaved, 'wiki'));
  write(withSaved, '.unbranch.json', { project: 'p1', docs: { features: 'wiki' } });
  const prompt2 = scripted([SKILLS_Q, 'n']);
  await init(t, withSaved, [], { isTTY: true, prompt: prompt2 });
  assert.equal(prompt2.questions.some((q) => FEATURES_Q.test(q)), false);
  assert.deepEqual(read(withSaved, '.unbranch.json').docs, { features: 'wiki' });
});

test('init keeps saved docs over the standard ones it finds', async (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, 'docs', 'features'), { recursive: true });
  mkdirSync(join(dir, 'docs', 'codebase'), { recursive: true });
  write(dir, '.unbranch.json', { docs: { features: 'product/features', other: 'kept' } });
  await init(t, dir, ['--yes']);
  assert.deepEqual(read(dir, '.unbranch.json').docs, {
    features: 'product/features',
    codebase: 'docs/codebase',
    other: 'kept',
  });
});

test('init --yes does not ask for a feature folder', async (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, 'wiki'));
  const { code } = await init(t, dir, ['--yes'], { isTTY: true, prompt: noPrompt });
  assert.equal(code, 0);
  assert.equal('docs' in read(dir, '.unbranch.json'), false);
});

// ---------------------------------------------------------------- another progress skill

for (const [answer, expected] of [
  ['y', true],
  ['yes', true],
  ['', false],
  ['n', false],
]) {
  test(`init saves autoProgress ${expected} when another progress skill exists and the answer is "${answer}"`, async (t) => {
    const dir = tempDir(t);
    const home = tempDir(t);
    write(home, '.claude/skills/todo/SKILL.md', PROGRESS_SKILL);
    const prompt = scripted([PROJECT_Q, 'p1'], [PROGRESS_Q, answer], [SKILLS_Q, 'n']);
    await init(t, dir, [], { isTTY: true, prompt, home });
    assert.match(prompt.questions.find((q) => PROGRESS_Q.test(q)), /\[y\/N\] $/);
    assert.equal(read(dir, '.unbranch.json').autoProgress, expected);
  });
}

test('init does not ask about progress when autoProgress is saved, and keeps it', async (t) => {
  const dir = tempDir(t);
  const home = tempDir(t);
  write(dir, '.claude/skills/roadmap/SKILL.md', '---\nname: roadmap\ndescription: The roadmap.\n---\n');
  write(dir, '.unbranch.json', { project: 'p1', autoProgress: true });
  const prompt = scripted([SKILLS_Q, 'n']);
  await init(t, dir, [], { isTTY: true, prompt, home });
  assert.equal(prompt.questions.some((q) => PROGRESS_Q.test(q)), false);
  assert.equal(read(dir, '.unbranch.json').autoProgress, true);
});

test('init does not ask about progress without another progress skill', async (t) => {
  const dir = tempDir(t);
  const prompt = scripted([PROJECT_Q, 'p1'], [SKILLS_Q, 'n']);
  await init(t, dir, [], { isTTY: true, prompt });
  assert.equal('autoProgress' in read(dir, '.unbranch.json'), false);
});

test('init --yes with another progress skill asks nothing and leaves autoProgress undecided', async (t) => {
  const dir = tempDir(t);
  const home = tempDir(t);
  write(home, '.claude/skills/todo/SKILL.md', PROGRESS_SKILL);
  const { code } = await init(t, dir, ['--yes'], { isTTY: true, prompt: noPrompt, home });
  assert.equal(code, 0);
  assert.equal('autoProgress' in read(dir, '.unbranch.json'), false);
});

test('init without a terminal keeps a saved autoProgress', async (t) => {
  const dir = tempDir(t);
  const home = tempDir(t);
  write(home, '.claude/skills/todo/SKILL.md', PROGRESS_SKILL);
  write(dir, '.unbranch.json', { autoProgress: false });
  await init(t, dir, [], { isTTY: false, home });
  assert.equal(read(dir, '.unbranch.json').autoProgress, false);
});

// ---------------------------------------------------------------- the skills

test('init --skills installs the plugin through claude at project scope, in the root', async (t) => {
  const root = tempDir(t);
  mkdirSync(join(root, '.git'));
  const sub = join(root, 'app');
  mkdirSync(sub);
  const { code, out, runs } = await init(t, sub, ['--yes', '--skills', '--project', 'p1']);
  assert.equal(code, 0);
  assert.deepEqual(
    runs.map((r) => [r.command, r.args, r.options.cwd]),
    [
      ['claude', MARKETPLACE_ADD, root],
      ['claude', PLUGIN_INSTALL, root],
    ],
  );
  assert.match(out, /Installed the unbranch skills \(unbranch@unbranch-kit\) for this project\./);
  assert.match(out, /Run \/unbranch:status/);
  assert.match(out, /Commit \.unbranch\.json, \.mcp\.json and \.claude\/settings\.json/);
  assert.equal(existsSync(join(root, 'CLAUDE.md')), false, 'without a prompt, no CLAUDE.md');
});

test('init asks about the skills with Yes as the default, and installs on "y"', async (t) => {
  const dir = tempDir(t);
  const prompt = scripted([PROJECT_Q, 'p1'], [SKILLS_Q, 'Y'], [CREATE_MD_Q, 'n']);
  const { runs } = await init(t, dir, [], { isTTY: true, prompt });
  assert.match(prompt.questions.find((q) => SKILLS_Q.test(q)), /\[Y\/n\] $/);
  assert.equal(runs.length, 2);
});

test('init installs nothing when the skills question is answered "n"', async (t) => {
  const dir = tempDir(t);
  const prompt = scripted([PROJECT_Q, 'p1'], [SKILLS_Q, 'n']);
  const { out, runs } = await init(t, dir, [], { isTTY: true, prompt });
  assert.equal(runs.length, 0);
  assert.doesNotMatch(out, /Installed the unbranch skills/);
  assert.match(out, /Commit \.unbranch\.json, \.mcp\.json so your team/);
});

test('init --no-skills neither asks nor installs', async (t) => {
  const dir = tempDir(t);
  const prompt = scripted([PROJECT_Q, 'p1']);
  const { code, runs } = await init(t, dir, ['--no-skills'], { isTTY: true, prompt });
  assert.equal(code, 0);
  assert.equal(runs.length, 0);
  assert.equal(prompt.questions.length, 1);
});

test('init --skills does not ask about the skills', async (t) => {
  const dir = tempDir(t);
  const prompt = scripted([PROJECT_Q, 'p1'], [CREATE_MD_Q, 'n']);
  const { runs } = await init(t, dir, ['--skills'], { isTTY: true, prompt });
  assert.equal(runs.length, 2);
  assert.equal(prompt.questions.some((q) => SKILLS_Q.test(q)), false);
});

for (const file of ['settings.json', 'settings.local.json']) {
  test(`init does not install when .claude/${file} already enables the plugin, and offers the note`, async (t) => {
    const dir = tempDir(t);
    write(dir, `.claude/${file}`, { enabledPlugins: { 'unbranch@unbranch-kit': true } });
    write(dir, 'CLAUDE.md', '# Mine\n');
    const prompt = scripted([PROJECT_Q, 'p1'], [ADD_MD_Q, 'n']);
    const { code, out, runs } = await init(t, dir, [], { isTTY: true, prompt });
    assert.equal(code, 0);
    assert.equal(runs.length, 0);
    assert.equal(prompt.questions.some((q) => SKILLS_Q.test(q)), false);
    assert.match(out, /- the unbranch skills are already installed/);
    assert.match(out, /Run \/unbranch:status/);
    assert.equal(readText(dir, 'CLAUDE.md'), '# Mine\n');
  });
}

test('init carries on when the marketplace or plugin is already there', async (t) => {
  const dir = tempDir(t);
  const run = fakeRun((args) => ({
    status: 1,
    stdout: '',
    stderr: args[1] === 'marketplace'
      ? "Marketplace 'unbranch-kit' is already installed"
      : 'Plugin unbranch@unbranch-kit is already installed',
  }));
  const { code, out } = await init(t, dir, ['--yes', '--skills'], { run });
  assert.equal(code, 0);
  assert.equal(run.calls.length, 2);
  assert.match(out, /Installed the unbranch skills/);
  assert.doesNotMatch(out, /failed/);
});

// ---------------------------------------------------------------- auto-update

const MARKETPLACE_ENTRY = { source: { source: 'github', repo: 'TYU-Zeng/unbranch-kit' }, autoUpdate: true };

test('init --skills turns on auto-update for the marketplace in .claude/settings.json', async (t) => {
  const dir = tempDir(t);
  const { code, out } = await init(t, dir, ['--yes', '--skills']);
  assert.equal(code, 0);
  assert.deepEqual(read(dir, '.claude/settings.json'), {
    extraKnownMarketplaces: { 'unbranch-kit': MARKETPLACE_ENTRY },
  });
  assert.match(out, /Turned on auto-update for the unbranch skills/);
});

test('init turns on auto-update where the skills were installed before, keeping the rest', async (t) => {
  const dir = tempDir(t);
  write(dir, '.claude/settings.json', {
    permissions: { allow: ['Bash(npm test)'] },
    extraKnownMarketplaces: {
      other: { source: { source: 'github', repo: 'someone/else' } },
      'unbranch-kit': { source: { source: 'github', repo: 'TYU-Zeng/unbranch-kit' } },
    },
    enabledPlugins: { 'unbranch@unbranch-kit': true },
  });
  const { code, runs } = await init(t, dir, ['--yes']);
  assert.equal(code, 0);
  assert.equal(runs.length, 0, 'nothing installed again');
  assert.deepEqual(read(dir, '.claude/settings.json'), {
    permissions: { allow: ['Bash(npm test)'] },
    extraKnownMarketplaces: {
      other: { source: { source: 'github', repo: 'someone/else' } },
      'unbranch-kit': MARKETPLACE_ENTRY,
    },
    enabledPlugins: { 'unbranch@unbranch-kit': true },
  });
});

for (const [file, value] of [['settings.json', false], ['settings.json', true], ['settings.local.json', false]]) {
  test(`init leaves autoUpdate: ${value} in .claude/${file} as it is`, async (t) => {
    const dir = tempDir(t);
    const settings = {
      extraKnownMarketplaces: { 'unbranch-kit': { source: { source: 'github', repo: 'TYU-Zeng/unbranch-kit' }, autoUpdate: value } },
      enabledPlugins: { 'unbranch@unbranch-kit': true },
    };
    write(dir, `.claude/${file}`, settings);
    const { out } = await init(t, dir, ['--yes']);
    assert.deepEqual(read(dir, `.claude/${file}`), settings);
    assert.equal(existsSync(join(dir, '.claude', file === 'settings.json' ? 'settings.local.json' : 'settings.json')), false);
    assert.doesNotMatch(out, /Turned on auto-update/);
  });
}

test('init touches no settings when the skills are not installed', async (t) => {
  const dir = tempDir(t);
  await init(t, dir, ['--yes']);
  assert.equal(existsSync(join(dir, '.claude')), false);
});

test('init says so and leaves .claude/settings.json alone when it is not JSON', async (t) => {
  const dir = tempDir(t);
  write(dir, '.claude/settings.json', '{ not json');
  const { code, out } = await init(t, dir, ['--yes', '--skills']);
  assert.equal(code, 0);
  assert.equal(readText(dir, '.claude/settings.json'), '{ not json');
  assert.match(out, /settings\.json is not valid JSON .*; the unbranch skills will not update on their own\./);
});

for (const [label, answer] of [
  ['ENOENT', { error: Object.assign(new Error('spawnSync claude ENOENT'), { code: 'ENOENT' }), status: null }],
  ['exit status 127', { status: 127, stdout: '', stderr: 'sh: 1: claude: not found' }],
  ['"command not found"', { status: 1, stdout: '', stderr: 'bash: claude: command not found' }],
  [
    "Windows' cmd wording",
    {
      status: 1,
      stdout: '',
      stderr: "'claude' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n",
    },
  ],
  [
    'cmd status 9009 in another language',
    { status: 9009, stdout: '', stderr: "Der Befehl \"claude\" ist entweder falsch geschrieben oder\r\nkonnte nicht gefunden werden.\r\n" },
  ],
]) {
  test(`init prints both commands by hand and exits 1 when claude is not found (${label})`, async (t) => {
    const dir = tempDir(t);
    const run = fakeRun(() => answer);
    const prompt = scripted([PROJECT_Q, 'p1'], [SKILLS_Q, 'y']);
    const { code, out } = await init(t, dir, [], { isTTY: true, prompt, run });
    assert.equal(code, 1);
    assert.equal(run.calls.length, 1, 'stops after the first command');
    assert.match(out, /Claude Code's "claude" command was not found\. Install the skills by hand:/);
    assert.ok(out.includes(`  claude ${MARKETPLACE_ADD.join(' ')}`), out);
    assert.ok(out.includes(`  claude ${PLUGIN_INSTALL.join(' ')}`), out);
    assert.doesNotMatch(out, /Installed the unbranch skills/);
    assert.equal(prompt.questions.some((q) => CREATE_MD_Q.test(q)), false, 'no CLAUDE.md note');
    assert.equal(existsSync(join(dir, 'CLAUDE.md')), false);
    assert.equal(read(dir, '.unbranch.json').project, 'p1', 'the binding is still written');
    assert.equal(read(dir, '.mcp.json').mcpServers.unbranch.type, 'http', 'the connection is still written');
  });
}

test('init prints both commands and exits 1 when claude takes too long', async (t) => {
  const dir = tempDir(t);
  const run = fakeRun(() => ({
    error: Object.assign(new Error('spawnSync claude ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    status: null,
    signal: 'SIGTERM',
    stdout: '',
    stderr: '',
  }));
  const { code, out } = await init(t, dir, ['--yes', '--skills'], { run });
  assert.equal(code, 1);
  assert.equal(run.calls.length, 1);
  assert.ok(out.includes(`! "claude ${MARKETPLACE_ADD.join(' ')}" took too long and was stopped. Run it by hand:`), out);
  assert.ok(out.includes(`  claude ${PLUGIN_INSTALL.join(' ')}`), out);
  assert.doesNotMatch(out, /Installed the unbranch skills/);
  assert.equal(existsSync(join(dir, '.unbranch.json')), true);
});

test('init reports a failed install with the end of its output, exits 1 and adds no note', async (t) => {
  const dir = tempDir(t);
  write(dir, 'CLAUDE.md', '# Mine\n');
  const run = fakeRun((args) =>
    args[1] === 'install'
      ? { status: 1, stdout: 'Resolving…\n', stderr: 'line 1\nline 2\nPlugin "unbranch" not found in marketplace\n' }
      : { status: 0, stdout: 'Added marketplace', stderr: '' },
  );
  const prompt = scripted([PROJECT_Q, 'p1']);
  const { code, out } = await init(t, dir, ['--skills'], { isTTY: true, prompt, run });
  assert.equal(code, 1);
  assert.equal(run.calls.length, 2);
  assert.ok(out.includes(`! "claude ${PLUGIN_INSTALL.join(' ')}" failed:`), out);
  assert.match(out, /Plugin "unbranch" not found in marketplace/);
  assert.doesNotMatch(out, /Resolving/, 'only the last three lines');
  assert.doesNotMatch(out, /Installed the unbranch skills/);
  assert.equal(prompt.questions.some((q) => ADD_MD_Q.test(q)), false);
  assert.equal(readText(dir, 'CLAUDE.md'), '# Mine\n');
});

// ---------------------------------------------------------------- CLAUDE.md

test('init creates CLAUDE.md with the block when asked, after installing the skills', async (t) => {
  const dir = tempDir(t);
  const prompt = scripted([PROJECT_Q, 'p1'], [SKILLS_Q, ''], [CREATE_MD_Q, 'y']);
  const { code, out } = await init(t, dir, ['--name', 'e-menu'], { isTTY: true, prompt });
  assert.equal(code, 0);
  assert.match(prompt.questions.find((q) => CREATE_MD_Q.test(q)), /\[y\/N\] $/);
  const text = readText(dir, 'CLAUDE.md');
  assert.match(text, /^<!-- unbranch -->\n/);
  assert.match(text, /\n<!-- \/unbranch -->\n$/);
  assert.match(text, /This repository builds the unbranch project e-menu \(p1\)/);
  assert.match(text, /\/unbranch:progress/);
  assert.ok(out.includes(`Added the unbranch note in ${join(dir, 'CLAUDE.md')}`), out);
});

test('init does not create CLAUDE.md when the answer is Enter or no', async (t) => {
  for (const answer of ['', 'n']) {
    const dir = tempDir(t);
    const prompt = scripted([PROJECT_Q, 'p1'], [SKILLS_Q, 'y'], [CREATE_MD_Q, answer]);
    await init(t, dir, [], { isTTY: true, prompt });
    assert.equal(existsSync(join(dir, 'CLAUDE.md')), false, `answer "${answer}"`);
  }
});

test('init does not ask about CLAUDE.md when the skills are not installed', async (t) => {
  const dir = tempDir(t);
  write(dir, 'CLAUDE.md', '# Mine\n');
  const prompt = scripted([PROJECT_Q, 'p1'], [SKILLS_Q, 'n']);
  await init(t, dir, [], { isTTY: true, prompt });
  assert.equal(prompt.questions.some((q) => ADD_MD_Q.test(q) || CREATE_MD_Q.test(q)), false);
  assert.equal(readText(dir, 'CLAUDE.md'), '# Mine\n');
});

test('init without a prompt never writes CLAUDE.md, even with the skills installed', async (t) => {
  const dir = tempDir(t);
  write(dir, 'CLAUDE.md', '# Mine\n');
  const { code } = await init(t, dir, ['--yes', '--skills', '--project', 'p1']);
  assert.equal(code, 0);
  assert.equal(readText(dir, 'CLAUDE.md'), '# Mine\n');

  const plugin = tempDir(t);
  write(plugin, '.claude/settings.json', { enabledPlugins: { 'unbranch@unbranch-kit': true } });
  await init(t, plugin, [], { isTTY: false });
  assert.equal(existsSync(join(plugin, 'CLAUDE.md')), false);
});

test('init offers the note for an existing CLAUDE.md with Yes as the default, and appends it', async (t) => {
  const dir = tempDir(t);
  const mine = '# Rules\n\nUse tabs.';
  write(dir, 'CLAUDE.md', mine);
  const prompt = scripted([ADD_MD_Q, '']);
  const { code, out } = await init(t, dir, ['--skills', '--project', 'p1'], { isTTY: true, prompt });
  assert.equal(code, 0);
  assert.match(prompt.questions[0], /^Add a short note on the unbranch commands to CLAUDE\.md\? \[Y\/n\] $/);
  const text = readText(dir, 'CLAUDE.md');
  assert.ok(text.startsWith(`${mine}\n\n<!-- unbranch -->\n`), JSON.stringify(text));
  assert.ok(text.endsWith('<!-- /unbranch -->\n'));
  assert.match(text, /unbranch project p1;/);
  assert.match(out, /Added the unbranch note/);
});

test('init leaves an existing CLAUDE.md alone when the note is declined', async (t) => {
  const dir = tempDir(t);
  write(dir, 'CLAUDE.md', '# Rules\n');
  const prompt = scripted([ADD_MD_Q, 'n']);
  await init(t, dir, ['--skills', '--project', 'p1'], { isTTY: true, prompt });
  assert.equal(readText(dir, 'CLAUDE.md'), '# Rules\n');
});

test('re-running init replaces only the block in CLAUDE.md', async (t) => {
  const dir = tempDir(t);
  const before = '# Rules\n\n';
  const after = '\n\n## More rules\nKeep this.\n';
  write(dir, 'CLAUDE.md', `${before}<!-- unbranch -->\nold text\n<!-- /unbranch -->${after}`);
  const yes = () => ({ isTTY: true, prompt: scripted([ADD_MD_Q, 'y']) });
  const { out } = await init(t, dir, ['--skills', '--project', 'p2'], yes());
  const text = readText(dir, 'CLAUDE.md');
  assert.ok(text.startsWith(`${before}<!-- unbranch -->\nThis repository builds the unbranch project p2;`), text);
  assert.ok(text.endsWith(`<!-- /unbranch -->${after}`), text);
  assert.doesNotMatch(text, /old text/);
  assert.equal(text.split('<!-- unbranch -->').length, 2, 'one block');
  assert.match(out, /Updated the unbranch note/);

  await init(t, dir, ['--skills'], yes());
  assert.equal(readText(dir, 'CLAUDE.md'), text, 'a second run changes nothing');
});

test('init leaves CLAUDE.md untouched when no skills are installed', async (t) => {
  const dir = tempDir(t);
  write(dir, 'CLAUDE.md', '# Mine\n<!-- unbranch -->\nold\n<!-- /unbranch -->\n');
  await init(t, dir, ['--yes', '--no-skills', '--project', 'p1']);
  assert.equal(readText(dir, 'CLAUDE.md'), '# Mine\n<!-- unbranch -->\nold\n<!-- /unbranch -->\n');
});

for (const [label, content] of [
  ['a start marker without an end', '# Mine\n<!-- unbranch -->\nKeep me.\n'],
  ['an end marker without a start', '# Mine\nKeep me.\n<!-- /unbranch -->\n'],
  ['the end before the start', '# Mine\n<!-- /unbranch -->\nKeep me.\n<!-- unbranch -->\n'],
  ['two blocks', '<!-- unbranch -->\na\n<!-- /unbranch -->\nKeep me.\n<!-- unbranch -->\nb\n<!-- /unbranch -->\n'],
  ['two starts and one end', '<!-- unbranch -->\nKeep me.\n<!-- unbranch -->\nb\n<!-- /unbranch -->\n'],
]) {
  test(`init leaves CLAUDE.md as it is when it has ${label}`, async (t) => {
    const dir = tempDir(t);
    write(dir, 'CLAUDE.md', content);
    for (let i = 0; i < 2; i += 1) {
      const prompt = scripted([ADD_MD_Q, 'y']);
      const { code, out } = await init(t, dir, ['--skills', '--project', 'p1'], { isTTY: true, prompt });
      assert.equal(code, 0);
      assert.ok(
        out.includes(`! ${join(dir, 'CLAUDE.md')} has an unbranch marker without its pair; left as it is.`),
        out,
      );
      assert.match(out, /Remove the <!-- unbranch --> … <!-- \/unbranch --> lines by hand and run init again/);
      assert.doesNotMatch(out, /(Added|Updated) the unbranch note/);
    }
    assert.equal(readText(dir, 'CLAUDE.md'), content);
  });
}

// ---------------------------------------------------------------- other MCP servers

test('init warns about a local "unbranch" server at another address', async (t) => {
  const dir = tempDir(t);
  const home = tempDir(t);
  const key = projectKey(dir);
  write(home, '.claude.json', {
    projects: { [key]: { mcpServers: { unbranch: { type: 'http', url: 'https://old.example/mcp' } } } },
  });
  const { code, out } = await init(t, dir, ['--yes'], { home });
  assert.equal(code, 0);
  assert.match(out, /! A local "unbranch" server \(https:\/\/old\.example\/mcp\) takes precedence over this project's\./);
  assert.match(out, /claude mcp remove unbranch -s local/);
});

test('init does not warn about a local "unbranch" server at the same address', async (t) => {
  const dir = tempDir(t);
  const home = tempDir(t);
  write(home, '.claude.json', {
    projects: { [dir]: { mcpServers: { unbranch: { type: 'http', url: 'https://api.unbranch.ai/mcp' } } } },
  });
  const { out } = await init(t, dir, ['--yes'], { home });
  assert.doesNotMatch(out, /^!/m);
});

test('init warns about other-named servers at an unbranch address', async (t) => {
  const dir = tempDir(t);
  const home = tempDir(t);
  write(home, '.claude.json', {
    mcpServers: { 'unbranch-dev': { type: 'http', url: 'https://api-dev.unbranch.ai/mcp' } },
  });
  const { code, out } = await init(t, dir, ['--yes'], { home });
  assert.equal(code, 0);
  assert.match(
    out,
    /! "unbranch-dev" \(user\) also points at unbranch \(https:\/\/api-dev\.unbranch\.ai\/mcp\) — the agent would see two sets of tools\./,
  );
  assert.match(out, /claude mcp remove unbranch-dev -s user/);
});
