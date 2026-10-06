import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { doctor } from './doctor.js';
import { init } from './init.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const HELP = `unbranch ${version} — connect this repository to your team's product model

Usage:
  npx unbranch init [--project <id>] [--name <name>] [--server <url>] [--yes]
  npx unbranch doctor
  npx unbranch --help | --version

init     Bind this repository to an unbranch project (.unbranch.json) and
         connect Claude Code to the server (.mcp.json), at the repository's
         root. No key is stored: Claude Code signs in through unbranch when it
         first connects.
doctor   Check that both files are in place and the server answers.

Options:
  --project <id>   The unbranch project this repository builds.
  --name <name>    A name to show beside the id, so a wrong binding is noticed.
  --server <url>   Another unbranch server (default https://api.unbranch.ai).
  -y, --yes        Ask nothing; leave the project for later if none is given.
  -h, --help       This text.
  -v, --version    The version.
`;

const FLAGS = new Set(['project', 'name', 'server']);
const SWITCHES = new Set(['yes', 'help', 'version']);
const SHORT = { '-h': '--help', '-v': '--version', '-y': '--yes' };

/**
 * `--name value` and `--name=value`, both, since both get typed. Anything it
 * does not understand is refused rather than ignored: a misspelt `--projcet`,
 * or a stray word, that did nothing would leave a repository bound to nothing
 * without a word.
 */
export function parseArgs(argv) {
  const options = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = SHORT[argv[i]] ?? argv[i];
    if (!arg.startsWith('--')) {
      rest.push(arg);
      continue;
    }
    const [flag, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (SWITCHES.has(flag)) {
      if (inline !== undefined) throw new Error(`--${flag} takes no value`);
      options[flag] = true;
    } else if (FLAGS.has(flag)) {
      // A flag right after another is a missing value, not the value:
      // `--project --yes` would otherwise bind to a project named "--yes".
      const value = inline ?? argv[(i += 1)];
      if (value === undefined || value.trim() === '' || value.startsWith('-')) {
        throw new Error(`--${flag} needs a value`);
      }
      options[flag] = value;
    } else {
      throw new Error(`unknown option --${flag}`);
    }
  }
  if (rest.length > 1) {
    throw new Error(`unexpected "${rest.slice(1).join(' ')}"`);
  }
  return { command: rest[0], options };
}

export async function main(argv, io = {}) {
  const log = io.log ?? ((line) => console.log(line));
  const cwd = io.cwd ?? process.cwd();
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    log(`unbranch: ${error.message}\n\n${HELP}`);
    return 2;
  }
  const { command, options } = parsed;
  if (options.version) {
    log(version);
    return 0;
  }
  if (options.help || !command) {
    log(HELP);
    return options.help ? 0 : 2;
  }
  try {
    if (command === 'init') {
      // Asked only when someone is there to answer and has not said not to.
      const interactive = !options.yes && (io.isTTY ?? process.stdin.isTTY);
      const prompt = interactive ? (io.prompt ?? ask) : undefined;
      return await init({ cwd, options, prompt, log });
    }
    if (command === 'doctor') {
      return await doctor({ cwd, fetch: io.fetch ?? fetch, log });
    }
  } catch (error) {
    log(`unbranch: ${error.message}`);
    return 1;
  }
  log(`unbranch: unknown command "${command}"\n\n${HELP}`);
  return 2;
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}
