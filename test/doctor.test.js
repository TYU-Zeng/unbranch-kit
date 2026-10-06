import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import { main } from '../src/cli.js';

function tempDir(t) {
  const dir = mkdtempSync(tmpdir() + sep);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const write = (dir, file, value) =>
  writeFileSync(join(dir, file), typeof value === 'string' ? value : JSON.stringify(value));

const SERVER = 'https://api.unbranch.ai';
const MCP_URL = `${SERVER}/mcp`;
const NOT_SET_UP = 'Not set up yet — see above.';

function setUp(dir, { binding, mcpUrl = MCP_URL } = {}) {
  write(dir, '.unbranch.json', binding ?? { project: 'p1', server: SERVER });
  if (mcpUrl) write(dir, '.mcp.json', { mcpServers: { unbranch: { type: 'http', url: mcpUrl } } });
}

async function doctor(dir, fetch = async () => ({ status: 405 })) {
  const lines = [];
  const calls = [];
  const code = await main(['doctor'], {
    cwd: dir,
    log: (line) => lines.push(line),
    fetch: (url, init) => {
      calls.push({ url, init });
      return fetch(url, init);
    },
  });
  return {
    code,
    lines,
    out: lines.join('\n'),
    calls,
    passed: lines.filter((l) => l.startsWith('✓')),
    failed: lines.filter((l) => l.startsWith('✗')),
  };
}

test('doctor passes every check when both files agree and the server answers 405', async (t) => {
  const dir = tempDir(t);
  setUp(dir);
  const { code, lines, passed, failed, calls, out } = await doctor(dir);
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
});

test('doctor counts any HTTP status as the server answering', async (t) => {
  const dir = tempDir(t);
  setUp(dir);
  const { code } = await doctor(dir, async () => ({ status: 503 }));
  assert.equal(code, 0);
});

test('doctor accepts a binding whose server has a trailing slash', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { binding: { project: 'p1', server: `${SERVER}/` } });
  const { code } = await doctor(dir);
  assert.equal(code, 0);
});

test('doctor reads files that start with a byte order mark', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', `﻿${JSON.stringify({ project: 'p1', server: SERVER })}`);
  write(
    dir,
    '.mcp.json',
    `﻿${JSON.stringify({ mcpServers: { unbranch: { type: 'http', url: MCP_URL } } })}`,
  );
  const { code, failed } = await doctor(dir);
  assert.deepEqual(failed, []);
  assert.equal(code, 0);
});

test('doctor run from a subfolder checks the root that holds .git', async (t) => {
  const root = tempDir(t);
  mkdirSync(join(root, '.git'));
  setUp(root);
  const sub = join(root, 'packages', 'web');
  mkdirSync(sub, { recursive: true });
  const { code, lines } = await doctor(sub);
  assert.equal(code, 0);
  assert.equal(lines[0], `Checking ${root}`);
  assert.equal(lines.at(-1), `All set: ${join(root, '.unbranch.json')}`);
});

test('doctor fails with both files missing and does not knock on any server', async (t) => {
  const dir = tempDir(t);
  const { code, failed, calls, out, lines } = await doctor(dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 2);
  assert.match(out, /\.unbranch\.json not found/);
  assert.match(out, /\.mcp\.json has the "unbranch" server/);
  assert.match(out, /→ run: npx unbranch init/);
  assert.equal(lines.at(-1), NOT_SET_UP);
  assert.equal(calls.length, 0);
});

test('doctor fails without .mcp.json but still checks the server from the binding', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { mcpUrl: null });
  const { code, failed, calls, lines } = await doctor(dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /\.mcp\.json has the "unbranch" server/);
  assert.equal(calls[0]?.url, MCP_URL);
  assert.equal(lines.at(-1), NOT_SET_UP);
});

test('doctor fails without .unbranch.json but still checks the server from .mcp.json', async (t) => {
  const dir = tempDir(t);
  write(dir, '.mcp.json', { mcpServers: { unbranch: { type: 'http', url: MCP_URL } } });
  const { code, failed, calls } = await doctor(dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /\.unbranch\.json not found/);
  assert.equal(calls[0]?.url, MCP_URL);
});

test('doctor fails when no project is set and says how to set one', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { binding: { server: SERVER } });
  const { code, failed, out } = await doctor(dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /bound to a project/);
  assert.match(out, /→ run: npx unbranch init --project <id>/);
});

test('doctor fails when the project is only blanks', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { binding: { project: '   ', server: SERVER } });
  const { code, failed } = await doctor(dir);
  assert.equal(code, 1);
  assert.match(failed[0], /bound to a project/);
});

test('doctor fails when the binding names no server', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { binding: { project: 'p1' } });
  const { code, failed, out, calls } = await doctor(dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /\.unbranch\.json: the server must be an address/);
  assert.match(out, /→ run: npx unbranch init --server <url>/);
  assert.equal(calls[0]?.url, MCP_URL, 'still checks the server .mcp.json points at');
});

test('doctor fails when the binding server is not an http(s) address', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { binding: { project: 'p1', server: 'foo' } });
  const { code, failed } = await doctor(dir);
  assert.equal(code, 1);
  assert.match(failed[0], /\.unbranch\.json: "foo" is not an address/);
});

test('doctor fails when .unbranch.json does not hold a JSON object', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', 'null');
  write(dir, '.mcp.json', { mcpServers: { unbranch: { type: 'http', url: MCP_URL } } });
  const { code, failed } = await doctor(dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /\.unbranch\.json must hold a JSON object/);
});

test('doctor fails when .mcp.json points somewhere else, and knocks on that url', async (t) => {
  const dir = tempDir(t);
  setUp(dir, { mcpUrl: 'https://api-dev.unbranch.ai/mcp' });
  const { code, failed, out, calls } = await doctor(dir);
  assert.equal(code, 1);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /\.mcp\.json points at https:\/\/api\.unbranch\.ai\/mcp/);
  assert.match(out, /it points at https:\/\/api-dev\.unbranch\.ai\/mcp; run: npx unbranch init/);
  assert.equal(calls[0].url, 'https://api-dev.unbranch.ai/mcp');
});

test('doctor fails when the unbranch entry is not an http server', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: 'p1', server: SERVER });
  write(dir, '.mcp.json', { mcpServers: { unbranch: { command: 'unbranch-mcp' } } });
  const { code, failed } = await doctor(dir);
  assert.equal(code, 1);
  assert.match(failed[0], /\.mcp\.json has the "unbranch" server/);
});

test('doctor fails when the server does not answer', async (t) => {
  const dir = tempDir(t);
  setUp(dir);
  const { code, failed, out, lines } = await doctor(dir, async () => {
    throw new TypeError('fetch failed');
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
  const { code, failed, calls } = await doctor(dir);
  assert.equal(code, 1);
  assert.match(failed[0], /\.unbranch\.json is not valid JSON/);
  assert.match(failed[1], /\.mcp\.json is not valid JSON/);
  assert.equal(calls.length, 0);
});

for (const [server, message] of [
  ['https://user:pw@api.unbranch.ai', /must not carry a username or password/],
  ['https://api.unbranch.ai/?a=b', /must not carry a query or a fragment/],
  ['https://api.unbranch.ai/#frag', /must not carry a query or a fragment/],
]) {
  test(`doctor fails when the binding server is ${server}`, async (t) => {
    const dir = tempDir(t);
    setUp(dir, { binding: { project: 'p1', server } });
    const { code, failed, lines } = await doctor(dir);
    assert.equal(code, 1);
    assert.equal(failed.length, 1);
    assert.match(failed[0], /^✗ \.unbranch\.json: /);
    assert.match(failed[0], message);
    assert.equal(lines.at(-1), NOT_SET_UP);
  });
}

test('doctor fails when mcpServers is not an object', async (t) => {
  const dir = tempDir(t);
  write(dir, '.unbranch.json', { project: 'p1', server: SERVER });
  write(dir, '.mcp.json', '{"mcpServers":"unbranch"}');
  const { code, failed } = await doctor(dir);
  assert.equal(code, 1);
  assert.match(failed[0], /\.mcp\.json has the "unbranch" server/);
});
