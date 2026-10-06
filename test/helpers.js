// Shared by the test files. `node --test` also loads this file as a test file;
// it declares no test, so it reports nothing.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.js';

/** The kit repository itself: also the Claude Code plugin's root. */
export const REPO = fileURLToPath(new URL('..', import.meta.url));

/** A fresh folder for one test, removed after it. */
export function tempDir(t) {
  const dir = mkdtempSync(tmpdir() + sep);
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export const read = (dir, file) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
export const readText = (dir, file) => readFileSync(join(dir, file), 'utf8');

/** Writes a file (JSON unless a string), creating its folders. */
export function write(dir, file, value) {
  const path = join(dir, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
  return path;
}

/**
 * Stands in for running `claude`: records each call and answers with
 * `answer(args)`, or success. Nothing is ever spawned.
 */
export function fakeRun(answer = () => ({ status: 0, stdout: '', stderr: '' })) {
  const run = (command, args, options) => {
    run.calls.push({ command, args, options });
    return answer(args, run.calls.length);
  };
  run.calls = [];
  return run;
}

/**
 * A prompt that answers by question: the first `[pattern, answer]` whose
 * pattern matches. A question nobody expected fails the test.
 */
export function scripted(...answers) {
  const prompt = async (question) => {
    prompt.questions.push(question);
    const match = answers.find(([pattern]) => pattern.test(question));
    if (!match) throw new Error(`unexpected question: ${question}`);
    return match[1];
  };
  prompt.questions = [];
  return prompt;
}

/**
 * A project path the way `~/.claude.json` may spell it: forward slashes, a
 * trailing slash, and — where the file system ignores case — another case.
 */
export const projectKey = (root) => {
  const path = `${root.split('\\').join('/')}/`;
  return process.platform === 'linux' ? path : path.toUpperCase();
};

export const noPrompt = () => {
  throw new Error('prompted although it should not have');
};

/**
 * `main` with everything injected: a temp `cwd` and `home` unless given, a
 * fake `run`, no terminal, and the log collected.
 */
export async function cli(t, argv, io = {}) {
  const lines = [];
  const run = io.run ?? fakeRun();
  const code = await main(argv, {
    cwd: io.cwd ?? tempDir(t),
    home: io.home ?? tempDir(t),
    isTTY: false,
    ...io,
    run,
    log: (line) => lines.push(line),
  });
  return { code, lines, out: lines.join('\n'), runs: run.calls };
}

/**
 * Fails the file if a run left `.mcp.json` or `.unbranch.json` at the kit's
 * own root: there a `.mcp.json` would ship as the plugin's own MCP server.
 */
export function guardRepoRoot() {
  after(() => {
    for (const file of ['.mcp.json', '.unbranch.json']) {
      assert.equal(existsSync(join(REPO, file)), false, `${file} was written at the kit's root ${REPO}`);
    }
  });
}
