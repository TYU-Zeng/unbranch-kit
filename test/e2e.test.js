import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/unbranch.js', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const run = (args, cwd) =>
  spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', timeout: 20_000 });

test('the bin prints its version, runs init --yes in a folder and exits with its codes', (t) => {
  const dir = mkdtempSync(tmpdir() + sep);
  t.after(() => rmSync(dir, { recursive: true, force: true }));

  const v = run(['--version'], dir);
  assert.equal(v.status, 0, v.stderr);
  assert.equal(v.stdout.trim(), version);

  const i = run(['init', '--yes', '--project', 'p1'], dir);
  assert.equal(i.status, 0, i.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.unbranch.json'), 'utf8')), {
    project: 'p1',
    server: 'https://api.unbranch.ai',
  });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8')), {
    mcpServers: { unbranch: { type: 'http', url: 'https://api.unbranch.ai/mcp' } },
  });

  assert.equal(run([], dir).status, 2);
  assert.equal(run(['init', '--nope'], dir).status, 2);
});

test('the bin runs init --yes without a project and without waiting on stdin', (t) => {
  const dir = mkdtempSync(tmpdir() + sep);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const i = run(['init', '--yes'], dir);
  assert.equal(i.status, 0, i.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.unbranch.json'), 'utf8')), {
    server: 'https://api.unbranch.ai',
  });
});
