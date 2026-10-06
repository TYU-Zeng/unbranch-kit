import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { guardRepoRoot, tempDir } from './helpers.js';

guardRepoRoot();

const BIN = fileURLToPath(new URL('../bin/unbranch.js', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * The real bin in a temp folder, with a temp home so `os.homedir()` (HOME on
 * POSIX, USERPROFILE on Windows) reads no real `~/.claude.json`. Every `init`
 * passes `--no-skills`, so the real `claude` is never run.
 */
function run(t, args, cwd) {
  const home = tempDir(t);
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 20_000,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

test('the bin prints its version, runs init in a folder and exits with its codes', (t) => {
  const dir = tempDir(t);

  const v = run(t, ['--version'], dir);
  assert.equal(v.status, 0, v.stderr);
  assert.equal(v.stdout.trim(), version);

  const i = run(t, ['init', '--yes', '--no-skills', '--project', 'p1'], dir);
  assert.equal(i.status, 0, i.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.unbranch.json'), 'utf8')), {
    project: 'p1',
    server: 'https://api.unbranch.ai',
  });
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8')), {
    mcpServers: { unbranch: { type: 'http', url: 'https://api.unbranch.ai/mcp' } },
  });
  assert.doesNotMatch(i.stdout, /Installed the unbranch skills|was not found/);

  assert.equal(run(t, [], dir).status, 2);
  assert.equal(run(t, ['init', '--nope'], dir).status, 2);
  assert.equal(run(t, ['init', '--skills', '--no-skills'], dir).status, 1);
});

test('the bin runs init --yes --no-skills without a project and without waiting on stdin', (t) => {
  const dir = tempDir(t);
  const i = run(t, ['init', '--yes', '--no-skills'], dir);
  assert.equal(i.status, 0, i.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.unbranch.json'), 'utf8')), {
    server: 'https://api.unbranch.ai',
  });
  assert.equal(existsSync(join(dir, 'CLAUDE.md')), false);
});
