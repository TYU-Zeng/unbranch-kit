import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { cli, guardRepoRoot, tempDir, write } from './helpers.js';

guardRepoRoot();

const SERVER = 'https://api.unbranch.ai';
const MCP_URL = `${SERVER}/mcp`;
const NOT_SET_UP = 'Not set up yet — see above.';
const CONNECTOR = /^! a claude\.ai connector to unbranch, if you added one/;

function setUp(dir, { binding, mcpUrl = MCP_URL } = {}) {
  write(dir, '.unbranch.json', binding ?? { project: 'p1', server: SERVER });
  if (mcpUrl) write(dir, '.mcp.json', { mcpServers: { unbranch: { type: 'http', url: mcpUrl } } });
}

/** `unbranch doctor` in `dir`, with a temp home unless given and a fake fetch. */
async function doctor(t, dir, { fetch = async () => ({ status: 405 }), home } = {}) {
  const calls = [];
  const result = await cli(t, ['doctor'], {
    cwd: dir,
    ...(home ? { home } : {}),
    fetch: (url, init) => {
      calls.push({ url, init });
      return fetch(url, init);
    },
  });
  return {
    ...result,
    calls,
    passed: result.lines.filter((l) => l.startsWith('✓')),
    failed: result.lines.filter((l) => l.startsWith('✗')),
    notes: result.lines.filter((l) => l.startsWith('!')),
  };
}

test('doctor passes every check when both files agree and the server answers 405', async (t) => {
  const dir = tempDir(t);
  setUp(dir);
  const { code, lines, passed, failed, calls, out, notes } = await doctor(t, dir);
  assert.equal(code, 0);
  assert.equal(lines[0], `Checking ${dir}`);
  assert.equal(lines.at(-1), `All set: ${join(dir, '.unbranch.json')}`);
  assert.deepEqual(failed, []);
  assert.equal(passed.length, 5);
  assert.match(out, /\.unbranch\.json names the server https:\/\/api\.unbranch\.ai/);
  assert.match(out, /bound to project p1/);
  assert.match(out, /server answers at https:\/\/api\.unbranch\.ai\/mcp \(HTTP 405\)/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, MCP_URL);
  assert.ok(calls[0].init.signal instanceof AbortSignal, 'fetch is given a timeout signal');
  // Notes are not failures.
  assert.equal(notes.length, 2);
  assert.match(notes[0], CONNECTOR);
  assert.match(notes[1], /^! the unbranch skills are not installed\n {4}→ npx @unbranch\/kit init --skills$/);
});

test('doctor counts any HTTP status as the server answering', async (t) => {
  const dir = tempDir(t);
  setUp(dir);
  const { code } = await doctor(t, dir, { fetch: async () => ({ status: 503 }) });
  assert.equal(code, 0);
});

test('doctor accepts a binding whose server has a trailing slash', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { binding: { project: 'p1', server: `${SERVER}/` } });
  const { code } = await doctor(t, dir);
  assert.equal(code, 0);
});

test('doctor reads files that start with a byte order mark', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', `\uFEFF${JSON.stringify({ project: 'p1', server: SERVER })}`);
  write(
    dir,
    '.mcp.json',
    `\uFEFF${JSON.stringify({ mcpServers: { unbranch: { type: 'http', url: MCP_URL } } })}`,
  );
  const { code, failed } = await doctor(t, dir);
  assert.deepEqual(failed, []);
  assert.equal(code, 0);
});

test('doctor run from a subfolder checks the root that holds .git', async (t) => {
  const root = tempDir(t);
  mkdirSync(join(root, '.git'));
  setUp(root);
  const sub = join(root, 'packages', 'web');
  mkdirSync(sub, { recursive: true });
  const { code, lines } = await doctor(t, sub);
  assert.equal(code, 0);
  assert.equal(lines[0], `Checking ${root}`);
  assert.equal(lines.at(-1), `All set: ${join(root, '.unbranch.json')}`);
});

test('doctor fails with both files missing and does not knock on any server', async (t) => {
  const dir = tempDir(t);
  const { code, failed, calls, out, lines } = await doctor(t, dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 2);
  assert.match(out, /\.unbranch\.json not found/);
  assert.match(out, /\.mcp\.json has the "unbranch" server/);
  assert.match(out, /→ run: npx @unbranch\/kit init/);
  assert.equal(lines.at(-1), NOT_SET_UP);
  assert.equal(calls.length, 0);
});

test('doctor fails without .mcp.json but still checks the server from the binding', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { mcpUrl: null });
  const { code, failed, calls, lines } = await doctor(t, dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /\.mcp\.json has the "unbranch" server/);
  assert.equal(calls[0]?.url, MCP_URL);
  assert.equal(lines.at(-1), NOT_SET_UP);
});

test('doctor fails without .unbranch.json but still checks the server from .mcp.json', async (t) => {
  const dir = tempDir(t);
  write(dir, '.mcp.json', { mcpServers: { unbranch: { type: 'http', url: MCP_URL } } });
  const { code, failed, calls } = await doctor(t, dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /\.unbranch\.json not found/);
  assert.equal(calls[0]?.url, MCP_URL);
});

test('doctor fails when no project is set and says how to set one', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { binding: { server: SERVER } });
  const { code, failed, out } = await doctor(t, dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /bound to a project/);
  assert.match(out, /→ run: npx @unbranch\/kit init --project <id>/);
});

test('doctor fails when the project is only blanks', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { binding: { project: '   ', server: SERVER } });
  const { code, failed } = await doctor(t, dir);
  assert.equal(code, 1);
  assert.match(failed[0], /bound to a project/);
});

test('doctor fails when the binding names no server', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { binding: { project: 'p1' } });
  const { code, failed, out, calls } = await doctor(t, dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /\.unbranch\.json: the server must be an address/);
  assert.match(out, /→ run: npx @unbranch\/kit init --server <url>/);
  assert.equal(calls[0]?.url, MCP_URL, 'still checks the server .mcp.json points at');
});

for (const [server, message] of [
  ['foo', /"foo" is not an address/],
  ['https://user:pw@api.unbranch.ai', /must not carry a username or password/],
  ['https://api.unbranch.ai/?a=b', /must not carry a query or a fragment/],
  ['https://api.unbranch.ai/#frag', /must not carry a query or a fragment/],
]) {
  test(`doctor fails when the binding server is ${server}`, async (t) => {
    const dir = tempDir(t);
    setUp(dir, { binding: { project: 'p1', server } });
    const { code, failed, lines } = await doctor(t, dir);
    assert.equal(code, 1);
    assert.equal(failed.length, 1);
    assert.match(failed[0], /^✗ \.unbranch\.json: /);
    assert.match(failed[0], message);
    assert.equal(lines.at(-1), NOT_SET_UP);
  });
}

test('doctor fails when .unbranch.json does not hold a JSON object', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', 'null');
  write(dir, '.mcp.json', { mcpServers: { unbranch: { type: 'http', url: MCP_URL } } });
  const { code, failed } = await doctor(t, dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /\.unbranch\.json must hold a JSON object/);
});

test('doctor fails when .mcp.json points somewhere else, and knocks on that url', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { mcpUrl: 'https://api-dev.unbranch.ai/mcp' });
  const { code, failed, out, calls } = await doctor(t, dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /\.mcp\.json points at https:\/\/api\.unbranch\.ai\/mcp/);
  assert.match(out, /it points at https:\/\/api-dev\.unbranch\.ai\/mcp; run: npx @unbranch\/kit init/);
  assert.equal(calls[0].url, 'https://api-dev.unbranch.ai/mcp');
});

test('doctor fails when the unbranch entry is not an http server', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: 'p1', server: SERVER });
  write(dir, '.mcp.json', { mcpServers: { unbranch: { command: 'unbranch-mcp' } } });
  const { code, failed } = await doctor(t, dir);
  assert.equal(code, 1);
  assert.match(failed[0], /\.mcp\.json has the "unbranch" server/);
});

test('doctor fails when mcpServers is not an object', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: 'p1', server: SERVER });
  write(dir, '.mcp.json', '{"mcpServers":"unbranch"}');
  const { code, failed } = await doctor(t, dir);
  assert.equal(code, 1);
  assert.match(failed[0], /\.mcp\.json has the "unbranch" server/);
});

test('doctor fails when the server does not answer', async (t) => {
  const dir = tempDir(t);
  setUp(dir);
  const { code, failed, out, lines } = await doctor(t, dir, {
    fetch: async () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /server does not answer at https:\/\/api\.unbranch\.ai\/mcp \(fetch failed\)/);
  assert.match(out, /→ check your network, or the server address/);
  assert.equal(lines.at(-1), NOT_SET_UP);
});

test('doctor reports invalid JSON in either file as a failed check', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', '{');
  write(dir, '.mcp.json', 'not json');
  const { code, failed, calls } = await doctor(t, dir);
  assert.equal(code, 1);
  assert.match(failed[0], /\.unbranch\.json is not valid JSON/);
  assert.match(failed[1], /\.mcp\.json is not valid JSON/);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- beside the connection

test('doctor fails when a local "unbranch" server points at another address', async (t) => {
  const dir = tempDir(t);
  const home = tempDir(t);
  setUp(dir);
  write(home, '.claude.json', {
    projects: {
      [dir.split('\\').join('/')]: {
        mcpServers: { unbranch: { type: 'http', url: 'https://old.example/mcp' } },
      },
    },
  });
  const { code, failed, out, lines } = await doctor(t, dir, { home });
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /a local "unbranch" server \(https:\/\/old\.example\/mcp\) takes precedence over \.mcp\.json/);
  assert.match(out, /→ remove it: claude mcp remove unbranch -s local/);
  assert.equal(lines.at(-1), NOT_SET_UP);
});

test('doctor passes when a local "unbranch" server points at the same address', async (t) => {
  const dir = tempDir(t);
  const home = tempDir(t);
  setUp(dir);
  write(home, '.claude.json', {
    projects: { [dir]: { mcpServers: { unbranch: { type: 'http', url: MCP_URL } } } },
  });
  const { code, failed } = await doctor(t, dir, { home });
  assert.deepEqual(failed, []);
  assert.equal(code, 0);
});

test('doctor notes, without failing, other-named servers at an unbranch address', async (t) => {
  const dir = tempDir(t);
  const home = tempDir(t);
  setUp(dir);
  write(home, '.claude.json', {
    mcpServers: { 'unbranch-dev': { type: 'http', url: 'https://api-dev.unbranch.ai/mcp' } },
    projects: { [dir]: { mcpServers: { mine: { type: 'http', url: 'https://unbranch.example/mcp' } } } },
  });
  const { code, notes, out } = await doctor(t, dir, { home });
  assert.equal(code, 0);
  assert.ok(notes.some((n) => /^! "mine" \(local\) also points at unbranch \(https:\/\/unbranch\.example\/mcp\) — two sets of tools/.test(n)), out);
  assert.ok(notes.some((n) => /^! "unbranch-dev" \(user\) also points at unbranch/.test(n)), out);
  assert.match(out, /→ if it is the same server: claude mcp remove unbranch-dev -s user/);
});

test('doctor always reminds about a claude.ai connector, even when files are missing', async (t) => {
  const dir = tempDir(t);
  const { notes } = await doctor(t, dir);
  assert.ok(notes.some((n) => CONNECTOR.test(n)));
});

test('doctor shows the skills installed when the project enables the plugin', async (t) => {
  const dir = tempDir(t);
  setUp(dir);
  write(dir, '.claude/settings.json', { enabledPlugins: { 'unbranch@unbranch-kit': true } });
  const { code, passed, notes } = await doctor(t, dir);
  assert.equal(code, 0);
  assert.ok(passed.includes('✓ the unbranch skills are installed for this project'));
  assert.equal(notes.some((n) => /skills are not installed/.test(n)), false);
});

test('doctor checks that docs.features exists', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { binding: { project: 'p1', server: SERVER, docs: { features: 'docs/features' } } });
  mkdirSync(join(dir, 'docs', 'features'), { recursive: true });
  const ok = await doctor(t, dir);
  assert.equal(ok.code, 0);
  assert.ok(ok.passed.includes('✓ feature documents at docs/features'));

  setUp(dir, { binding: { project: 'p1', server: SERVER, docs: { features: 'gone' } } });
  const missing = await doctor(t, dir);
  assert.equal(missing.code, 1);
  assert.match(missing.failed[0], /^✗ feature documents at gone/);
  assert.match(missing.out, /→ fix docs\.features in \.unbranch\.json, or run: npx @unbranch\/kit init/);
});

test('doctor says nothing about feature documents when docs.features is not set', async (t) => {
  const dir = tempDir(t);
  setUp(dir);
  const { out } = await doctor(t, dir);
  assert.doesNotMatch(out, /feature documents/);
});

for (const args of [
  ['--project', 'p1'],
  ['--name', 'x'],
  ['--server', 'https://api.unbranch.ai'],
  ['--skills'],
  ['--no-skills'],
  ['--yes'],
  ['-y'],
]) {
  test(`doctor ${args.join(' ')} exits 1 and checks nothing`, async (t) => {
    const dir = tempDir(t);
    setUp(dir);
    const calls = [];
    const { code, out, runs } = await cli(t, ['doctor', ...args], {
      cwd: dir,
      fetch: async (url) => {
        calls.push(url);
        return { status: 405 };
      },
    });
    assert.equal(code, 1);
    const flag = args[0] === '-y' ? '--yes' : args[0];
    assert.equal(out, `unbranch: doctor takes no ${flag}`);
    assert.equal(calls.length, 0);
    assert.equal(runs.length, 0);
  });
}

test('doctor names every option it does not take', async (t) => {
  const { code, out } = await cli(t, ['doctor', '--yes', '--project', 'p1']);
  assert.equal(code, 1);
  assert.equal(out, 'unbranch: doctor takes no --project, --yes');
});
