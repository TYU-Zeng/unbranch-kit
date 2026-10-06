import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import { main } from '../src/cli.js';
import { projectRoot } from '../src/config.js';

function tempDir(t) {
  const dir = mkdtempSync(tmpdir() + sep);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const read = (dir, file) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
const readText = (dir, file) => readFileSync(join(dir, file), 'utf8');
const write = (dir, file, value) =>
  writeFileSync(join(dir, file), typeof value === 'string' ? value : JSON.stringify(value));

const noPrompt = () => {
  throw new Error('prompted although it should not have');
};

async function init(dir, args = [], io = {}) {
  const lines = [];
  const code = await main(['init', ...args], {
    cwd: dir,
    isTTY: false,
    log: (line) => lines.push(line),
    ...io,
  });
  return { code, out: lines.join('\n') };
}

test('init in an empty folder writes both files with the default server', async (t) => {
  const dir = tempDir(t);
  const { code, out } = await init(dir, ['--yes']);
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
  assert.match(out, /npx unbranch init --project <id>/);
});

test('init writes JSON with two-space indent and a trailing newline', async (t) => {
  const dir = tempDir(t);
  await init(dir, ['--yes']);
  assert.equal(readText(dir, '.unbranch.json'), '{\n  "server": "https://api.unbranch.ai"\n}\n');
});

test('init takes --project, --name and --server', async (t) => {
  const dir = tempDir(t);
  const { code, out } = await init(dir, [
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
  await init(dir, ['--project', '  p1 ', '--name= e-menu ']);
  const binding = read(dir, '.unbranch.json');
  assert.equal(binding.project, 'p1');
  assert.equal(binding.name, 'e-menu');
});

test('init normalises trailing slashes in --server', async (t) => {
  const dir = tempDir(t);
  await init(dir, ['--yes', '--server', 'https://api-dev.unbranch.ai//']);
  assert.equal(read(dir, '.unbranch.json').server, 'https://api-dev.unbranch.ai');
  assert.equal(read(dir, '.mcp.json').mcpServers.unbranch.url, 'https://api-dev.unbranch.ai/mcp');
});

test('init keeps a path in --server without its trailing slash', async (t) => {
  const dir = tempDir(t);
  await init(dir, ['--yes', '--server', 'http://localhost:3000/base/']);
  assert.equal(read(dir, '.unbranch.json').server, 'http://localhost:3000/base');
  assert.equal(read(dir, '.mcp.json').mcpServers.unbranch.url, 'http://localhost:3000/base/mcp');
});

for (const [server, message] of [
  ['foo', /"foo" is not an address/],
  ['ftp://files.example', /"ftp:\/\/files\.example" is not an http\(s\) address/],
]) {
  test(`init refuses --server ${server} and writes nothing`, async (t) => {
    const dir = tempDir(t);
    const { code, out } = await init(dir, ['--yes', '--server', server]);
    assert.equal(code, 1);
    assert.match(out, message);
    assert.equal(existsSync(join(dir, '.unbranch.json')), false);
    assert.equal(existsSync(join(dir, '.mcp.json')), false);
  });
}

test('init refuses a non-string server in .unbranch.json and leaves it untouched', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', '{"server":42}');
  const { code, out } = await init(dir, ['--yes']);
  assert.equal(code, 1);
  assert.match(out, /the server must be an address/);
  assert.equal(readText(dir, '.unbranch.json'), '{"server":42}');
  assert.equal(existsSync(join(dir, '.mcp.json')), false);
});

test('init asks for a project when interactive and uses the trimmed answer', async (t) => {
  const dir = tempDir(t);
  const questions = [];
  const { code } = await init(dir, [], {
    isTTY: true,
    prompt: async (q) => {
      questions.push(q);
      return '  p42  ';
    },
  });
  assert.equal(code, 0);
  assert.equal(questions.length, 1);
  assert.match(questions[0], /project id/);
  assert.equal(read(dir, '.unbranch.json').project, 'p42');
});

test('init leaves the project unset when the prompt is answered with Enter', async (t) => {
  const dir = tempDir(t);
  const { code, out } = await init(dir, [], { isTTY: true, prompt: async () => '' });
  assert.equal(code, 0);
  assert.equal('project' in read(dir, '.unbranch.json'), false);
  assert.match(out, /no project yet/);
});

test('init does not prompt when --project is given', async (t) => {
  const dir = tempDir(t);
  const { code } = await init(dir, ['--project', 'p1'], { isTTY: true, prompt: noPrompt });
  assert.equal(code, 0);
  assert.equal(read(dir, '.unbranch.json').project, 'p1');
});

test('init does not prompt when the binding already names a project', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: 'p1', server: 'https://api.unbranch.ai' });
  const { code } = await init(dir, [], { isTTY: true, prompt: noPrompt });
  assert.equal(code, 0);
  assert.equal(read(dir, '.unbranch.json').project, 'p1');
});

test('init --yes and -y never prompt, even on a terminal', async (t) => {
  for (const flag of ['--yes', '-y']) {
    const dir = tempDir(t);
    const { code } = await init(dir, [flag], { isTTY: true, prompt: noPrompt });
    assert.equal(code, 0);
    assert.equal('project' in read(dir, '.unbranch.json'), false);
  }
});

test('init does not prompt without a terminal', async (t) => {
  const dir = tempDir(t);
  const { code } = await init(dir, [], { isTTY: false, prompt: noPrompt });
  assert.equal(code, 0);
  assert.equal('project' in read(dir, '.unbranch.json'), false);
});

test('re-running init keeps the project, the server and other keys', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', {
    project: 'p1',
    name: 'e-menu',
    server: 'https://api-dev.unbranch.ai',
    extra: { keep: true },
  });
  const { code } = await init(dir, ['--yes']);
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
  await init(dir, ['--yes', '--server', 'https://api.unbranch.ai']);
  assert.deepEqual(read(dir, '.unbranch.json'), {
    project: 'p1',
    server: 'https://api.unbranch.ai',
  });
});

test('re-running init with --project replaces the project', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: 'p1', server: 'https://api.unbranch.ai' });
  await init(dir, ['--project', 'p2']);
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
  const { out } = await init(dir, ['--yes']);
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
  write(dir, '.unbranch.json', `﻿${JSON.stringify({ project: 'p1' })}`);
  write(dir, '.mcp.json', `﻿${JSON.stringify({ mcpServers: { other: { command: 'x' } } })}`);
  const { code, out } = await init(dir, ['--yes']);
  assert.equal(code, 0, out);
  assert.deepEqual(read(dir, '.unbranch.json'), { project: 'p1', server: 'https://api.unbranch.ai' });
  assert.deepEqual(Object.keys(read(dir, '.mcp.json').mcpServers), ['other', 'unbranch']);
});

test('init refuses an invalid .unbranch.json and leaves both files untouched', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', '{ "project": "p1", ');
  const { code, out } = await init(dir, ['--yes']);
  assert.equal(code, 1);
  assert.match(out, /\.unbranch\.json is not valid JSON/);
  assert.equal(readText(dir, '.unbranch.json'), '{ "project": "p1", ');
  assert.equal(existsSync(join(dir, '.mcp.json')), false);
});

test('init refuses an invalid .mcp.json and writes neither file', async (t) => {
  const dir = tempDir(t);
  write(dir, '.mcp.json', '{ mcpServers: {} }');
  const { code, out } = await init(dir, ['--yes']);
  assert.equal(code, 1);
  assert.match(out, /\.mcp\.json is not valid JSON/);
  assert.equal(readText(dir, '.mcp.json'), '{ mcpServers: {} }');
  assert.equal(existsSync(join(dir, '.unbranch.json')), false);
});

for (const content of ['null', '[]', '42', '"text"']) {
  test(`init refuses a .unbranch.json holding ${content} and leaves it untouched`, async (t) => {
    const dir = tempDir(t);
    write(dir, '.unbranch.json', content);
    const { code, out } = await init(dir, ['--yes']);
    assert.equal(code, 1);
    assert.match(out, /\.unbranch\.json must hold a JSON object/);
    assert.equal(readText(dir, '.unbranch.json'), content);
    assert.equal(existsSync(join(dir, '.mcp.json')), false);
  });
}

test('init refuses a .mcp.json holding an array and writes neither file', async (t) => {
  const dir = tempDir(t);
  write(dir, '.mcp.json', '[]');
  const { code, out } = await init(dir, ['--yes']);
  assert.equal(code, 1);
  assert.match(out, /\.mcp\.json must hold a JSON object/);
  assert.equal(readText(dir, '.mcp.json'), '[]');
  assert.equal(existsSync(join(dir, '.unbranch.json')), false);
});

test('init run from a subfolder writes at the root that holds .git', async (t) => {
  const root = tempDir(t);
  mkdirSync(join(root, '.git'));
  const sub = join(root, 'packages', 'web');
  mkdirSync(sub, { recursive: true });
  const { code, out } = await init(sub, ['--yes']);
  assert.equal(code, 0);
  assert.equal(read(root, '.unbranch.json').server, 'https://api.unbranch.ai');
  assert.equal(read(root, '.mcp.json').mcpServers.unbranch.type, 'http');
  assert.equal(existsSync(join(sub, '.unbranch.json')), false);
  assert.equal(existsSync(join(sub, '.mcp.json')), false);
  assert.ok(out.includes(`Wrote ${join(root, '.unbranch.json')}`), out);
});

test('init finds the root when .git is a file (worktree or submodule)', async (t) => {
  const root = tempDir(t);
  write(root, '.git', 'gitdir: ../elsewhere\n');
  const sub = join(root, 'src');
  mkdirSync(sub);
  await init(sub, ['--yes']);
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
  const { code } = await init(sub, ['--yes']);
  assert.equal(code, 0);
  assert.equal(existsSync(join(sub, '.unbranch.json')), true);
  assert.equal(existsSync(join(sub, '.mcp.json')), true);
  assert.equal(existsSync(join(dir, '.unbranch.json')), false);
});

for (const [server, message] of [
  ['https://user:pw@api.unbranch.ai', /must not carry a username or password/],
  ['https://user@api.unbranch.ai', /must not carry a username or password/],
  ['https://api.unbranch.ai/?a=b', /must not carry a query or a fragment/],
  ['https://api.unbranch.ai/#frag', /must not carry a query or a fragment/],
]) {
  test(`init refuses --server ${server} and writes nothing`, async (t) => {
    const dir = tempDir(t);
    const { code, out } = await init(dir, ['--yes', '--server', server]);
    assert.equal(code, 1);
    assert.match(out, message);
    assert.equal(existsSync(join(dir, '.unbranch.json')), false);
    assert.equal(existsSync(join(dir, '.mcp.json')), false);
  });
}

test('init asks again when the saved project is only spaces', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: '   ', server: 'https://api.unbranch.ai' });
  let asked = 0;
  const { code } = await init(dir, [], {
    isTTY: true,
    prompt: async () => {
      asked += 1;
      return 'p7';
    },
  });
  assert.equal(code, 0);
  assert.equal(asked, 1);
  assert.equal(read(dir, '.unbranch.json').project, 'p7');
});

test('init --yes treats a saved project of only spaces as none', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: '   ', server: 'https://api.unbranch.ai' });
  const { code, out } = await init(dir, ['--yes']);
  assert.equal(code, 0);
  assert.match(out, /no project yet/);
  assert.match(out, /npx unbranch init --project <id>/);
});

for (const [label, content] of [
  ['a string', '{"mcpServers":"unbranch"}'],
  ['an array', '{"mcpServers":[]}'],
  ['null', '{"mcpServers":null}'],
]) {
  test(`init refuses a .mcp.json whose mcpServers is ${label} and writes neither file`, async (t) => {
    const dir = tempDir(t);
    write(dir, '.mcp.json', content);
    const { code, out } = await init(dir, ['--yes']);
    assert.equal(code, 1);
    assert.match(out, /\.mcp\.json: "mcpServers" must be an object/);
    assert.equal(readText(dir, '.mcp.json'), content);
    assert.equal(existsSync(join(dir, '.unbranch.json')), false);
  });
}

test('init tells you to open Claude Code at the root it wrote to', async (t) => {
  const root = tempDir(t);
  mkdirSync(join(root, '.git'));
  const sub = join(root, 'packages', 'web');
  mkdirSync(sub, { recursive: true });
  const { out } = await init(sub, ['--yes']);
  assert.ok(out.includes(`1. Open Claude Code in ${root} and allow the "unbranch" server`), out);
});
