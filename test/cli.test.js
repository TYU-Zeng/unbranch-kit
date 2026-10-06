import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { main, parseArgs } from '../src/cli.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

async function run(argv, io = {}) {
  const lines = [];
  const code = await main(argv, { log: (line) => lines.push(line), ...io });
  return { code, out: lines.join('\n') };
}

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
});

test('parseArgs refuses a second word', () => {
  assert.throws(() => parseArgs(['init', 'p1']), /unexpected "p1"/);
  assert.throws(() => parseArgs(['init', '-x']), /unexpected "-x"/);
});

test('--version and -v print the package version and exit 0', async () => {
  for (const flag of ['--version', '-v']) {
    const { code, out } = await run([flag]);
    assert.equal(code, 0);
    assert.equal(out, version);
  }
});

test('--help and -h print usage and exit 0', async () => {
  for (const flag of ['--help', '-h']) {
    const { code, out } = await run([flag]);
    assert.equal(code, 0);
    assert.match(out, /Usage:/);
  }
});

test('no command prints usage and exits 2', async () => {
  const { code, out } = await run([]);
  assert.equal(code, 2);
  assert.match(out, /Usage:/);
});

test('an unknown command exits 2 and names it', async () => {
  const { code, out } = await run(['deploy']);
  assert.equal(code, 2);
  assert.match(out, /unknown command "deploy"/);
});

test('an unknown flag exits 2 and names it', async () => {
  const { code, out } = await run(['init', '--projcet', 'p1']);
  assert.equal(code, 2);
  assert.match(out, /unknown option --projcet/);
});

test('a value flag with no value exits 2', async () => {
  const { code, out } = await run(['init', '--server']);
  assert.equal(code, 2);
  assert.match(out, /--server needs a value/);
});

test('--project --yes exits 2 instead of binding to "--yes"', async () => {
  const { code, out } = await run(['init', '--project', '--yes']);
  assert.equal(code, 2);
  assert.match(out, /--project needs a value/);
});

test('a stray word exits 2', async () => {
  const { code, out } = await run(['init', 'p1']);
  assert.equal(code, 2);
  assert.match(out, /unexpected "p1"/);
});
