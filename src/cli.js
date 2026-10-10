import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { VERSION } from './config.js';
import { doctor } from './doctor.js';
import { init } from './init.js';

const HELP = `unbranch ${VERSION} — connect this repository to your team's product model

Usage:
  npx @unbranch/kit init [--project <id>] [--name <name>] [--server <url>]
                    [--skills | --no-skills] [--yes]
  npx @unbranch/kit doctor
  npx @unbranch/kit --help | --version

init     Bind this repository to an unbranch project (.unbranch.json),
         connect Claude Code to the server (.mcp.json) and, if you say so,
         install the unbranch skills. It lists what the repository already
         has first and only fills what is missing. No key is stored: Claude
         Code signs in through unbranch when it first connects.
doctor   Check the files, the server, and any MCP server that would clash.

Options:
  --project <id>   The unbranch project this repository builds.
  --name <name>    A name to show beside the id, so a wrong binding is noticed.
  --server <url>   Another unbranch server (default https://api.unbranch.ai).
  --skills         Install the unbranch skills for Claude Code without asking.
  --no-skills      Do not install them, and do not ask.
  -y, --yes        Ask nothing; leave the project for later if none is given.
                   Installs the skills only with --skills.
  -h, --help       This text.
  -v, --version    The version.
`;

const FLAGS = new Set(['project', 'name', 'server']);
const SWITCHES = new Set(['yes', 'help', 'version', 'skills', 'no-skills']);
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
  const home = 'home' in io ? io.home : homedir();
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    log(`unbranch: ${error.message}\n\n${HELP}`);
    return 2;
  }
  const { command, options } = parsed;
  if (options.version) {
    log(VERSION);
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
      if (options.skills && options['no-skills']) {
        throw new Error('--skills and --no-skills cannot both be given');
      }
      return await init({ cwd, home, options, prompt, log, run: io.run ?? run });
    }
    if (command === 'doctor') {
      const extra = ['project', 'name', 'server', 'skills', 'no-skills', 'yes'].filter((f) => f in options);
      if (extra.length > 0) {
        throw new Error(`doctor takes no ${extra.map((f) => `--${f}`).join(', ')}`);
      }
      return await doctor({ cwd, home, fetch: io.fetch ?? fetch, log });
    }
  } catch (error) {
    log(`unbranch: ${error.message}`);
    return 1;
  }
  log(`unbranch: unknown command "${command}"\n\n${HELP}`);
  return 2;
}

/**
 * A command, the way a shell would find it: on Windows `claude` is a `.cmd`
 * shim, which only a shell resolves.
 */
function run(command, args, { cwd }) {
  const options = { cwd, encoding: 'utf8', timeout: 120_000 };
  // Through a shell, one command string: an args array with `shell: true`
  // is deprecated (DEP0190). The arguments here are fixed words, never input.
  return process.platform === 'win32'
    ? spawnSync([command, ...args].join(' '), { ...options, shell: true })
    : spawnSync(command, args, options);
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}
