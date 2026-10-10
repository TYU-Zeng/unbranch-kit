import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseArgs } from '../src/cli.js';
import { cli, guardRepoRoot, tempDir } from './helpers.js';

guardRepoRoot();

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('parseArgs reads a value flag in the --flag value form', () => {
  assert.deepEqual(parseArgs(['init', '--project', 'p1', '--name', 'e-menu']), {
    command: 'init',
    options: { project: 'p1', name: 'e-menu' },
  });
});

test('parseArgs reads a value flag in the --flag=value form', () => {
  assert.deepEqual(parseArgs(['init', '--server=https://x.test', '--project=p1']), {
    command: 'init',
    options: { server: 'https://x.test', project: 'p1' },
  });
});

test('parseArgs keeps everything after the first = in an inline value', () => {
  assert.equal(parseArgs(['--server=https://x.test/?a=b']).options.server, 'https://x.test/?a=b');
});

test('parseArgs reads boolean flags', () => {
  assert.deepEqual(parseArgs(['init', '--yes']).options, { yes: true });
  assert.deepEqual(parseArgs(['--help']).options, { help: true });
  assert.deepEqual(parseArgs(['--version']).options, { version: true });
  assert.deepEqual(parseArgs(['init', '--skills']).options, { skills: true });
  assert.deepEqual(parseArgs(['init', '--no-skills']).options, { 'no-skills': true });
});

test('parseArgs reads -y, -h and -v as --yes, --help and --version', () => {
  assert.deepEqual(parseArgs(['init', '-y']).options, { yes: true });
  assert.deepEqual(parseArgs(['-h']).options, { help: true });
  assert.deepEqual(parseArgs(['-v']).options, { version: true });
});

test('parseArgs returns no command when only flags are given', () => {
  assert.equal(parseArgs(['--yes']).command, undefined);
});

test('parseArgs refuses an unknown flag', () => {
  assert.throws(() => parseArgs(['init', '--projcet', 'p1']), /unknown option --projcet/);
});

test('parseArgs refuses a value flag with no value', () => {
  assert.throws(() => parseArgs(['init', '--project']), /--project needs a value/);
  assert.throws(() => parseArgs(['init', '--project=']), /--project needs a value/);
  assert.throws(() => parseArgs(['init', '--project', '   ']), /--project needs a value/);
});

test('parseArgs refuses a flag as the value of another flag', () => {
  assert.throws(() => parseArgs(['init', '--project', '--yes']), /--project needs a value/);
  assert.throws(() => parseArgs(['init', '--name', '-y']), /--name needs a value/);
});

test('parseArgs refuses a value on a switch', () => {
  assert.throws(() => parseArgs(['init', '--yes=false']), /--yes takes no value/);
  assert.throws(() => parseArgs(['--help=x']), /--help takes no value/);
  assert.throws(() => parseArgs(['init', '--skills=yes']), /--skills takes no value/);
  assert.throws(() => parseArgs(['init', '--no-skills=1']), /--no-skills takes no value/);
});

test('parseArgs refuses a second word', () => {
  assert.throws(() => parseArgs(['init', 'p1']), /unexpected "p1"/);
  assert.throws(() => parseArgs(['init', '-x']), /unexpected "-x"/);
});

test('--version and -v print the package version and exit 0', async (t) => {
  for (const flag of ['--version', '-v']) {
    const { code, out } = await cli(t, [flag]);
    assert.equal(code, 0);
    assert.equal(out, version);
  }
});

// Claude Code updates an installed plugin only when this version changes, and
// release-please bumps it with package.json (extra-files in its config).
test('the Claude Code plugin carries the package version', () => {
  const plugin = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
  assert.equal(plugin.version, version);
});

test('--help and -h print usage, naming --skills and --no-skills, and exit 0', async (t) => {
  for (const flag of ['--help', '-h']) {
    const { code, out } = await cli(t, [flag]);
    assert.equal(code, 0);
    assert.match(out, /Usage:/);
    assert.match(out, /--skills/);
    assert.match(out, /--no-skills/);
  }
});

test('no command prints usage and exits 2', async (t) => {
  const { code, out } = await cli(t, []);
  assert.equal(code, 2);
  assert.match(out, /Usage:/);
});

test('an unknown command exits 2 and names it', async (t) => {
  const { code, out } = await cli(t, ['deploy']);
  assert.equal(code, 2);
  assert.match(out, /unknown command "deploy"/);
});

test('an unknown flag exits 2 and names it', async (t) => {
  const { code, out } = await cli(t, ['init', '--projcet', 'p1']);
  assert.equal(code, 2);
  assert.match(out, /unknown option --projcet/);
});

test('a value flag with no value exits 2', async (t) => {
  const { code, out } = await cli(t, ['init', '--server']);
  assert.equal(code, 2);
  assert.match(out, /--server needs a value/);
});

test('--project --yes exits 2 instead of binding to "--yes"', async (t) => {
  const { code, out } = await cli(t, ['init', '--project', '--yes']);
  assert.equal(code, 2);
  assert.match(out, /--project needs a value/);
});

test('a stray word exits 2', async (t) => {
  const { code, out } = await cli(t, ['init', 'p1']);
  assert.equal(code, 2);
  assert.match(out, /unexpected "p1"/);
});

test('init --skills --no-skills exits 1, writes nothing and runs nothing', async (t) => {
  const dir = tempDir(t);
  const { code, out, runs } = await cli(t, ['init', '--skills', '--no-skills'], { cwd: dir });
  assert.equal(code, 1);
  assert.match(out, /--skills and --no-skills cannot both be given/);
  assert.equal(existsSync(join(dir, '.unbranch.json')), false);
  assert.equal(existsSync(join(dir, '.mcp.json')), false);
  assert.equal(runs.length, 0);
});
