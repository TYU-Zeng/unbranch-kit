import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { survey } from '../src/survey.js';
import { guardRepoRoot, projectKey, tempDir, write } from './helpers.js';

guardRepoRoot();

const BOM = String.fromCharCode(0xfeff);
const skill = (name, description) => `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`;
const dirs = (root, ...paths) => {
  for (const path of paths) mkdirSync(join(root, path), { recursive: true });
};

test('survey of an empty repository and home finds nothing', (t) => {
  assert.deepEqual(survey(tempDir(t), tempDir(t)), {
    docs: {},
    otherDocDirs: [],
    docSync: [],
    progressSkills: [],
    prePush: [],
    claudeMd: { exists: false, hasBlock: false },
    mcp: { local: undefined, user: undefined, others: [] },
    pluginInstalled: false,
    pluginAutoUpdate: undefined,
    pluginCopy: undefined,
  });
});

test('survey without a home still reads the repository', (t) => {
  const root = tempDir(t);
  write(root, '.claude/skills/todo/SKILL.md', skill('todo', 'The to-do list'));
  const found = survey(root, undefined);
  assert.deepEqual(found.mcp, { local: undefined, user: undefined, others: [] });
  assert.deepEqual(found.progressSkills, [join(root, '.claude', 'skills', 'todo', 'SKILL.md')]);
});

// ---------------------------------------------------------------- docs

test('survey finds the standard docs layout', (t) => {
  const root = tempDir(t);
  dirs(root, 'docs/features', 'docs/codebase');
  write(root, 'docs/SNAPSHOT.md', '#');
  write(root, 'docs/BACKLOG.md', '#');
  assert.deepEqual(survey(root, tempDir(t)).docs, {
    features: 'docs/features',
    codebase: 'docs/codebase',
    snapshot: 'docs/SNAPSHOT.md',
    backlog: 'docs/BACKLOG.md',
  });
});

test('survey wants folders and files of the right kind for the standard docs', (t) => {
  const root = tempDir(t);
  write(root, 'docs/features', 'a file, not a folder');
  dirs(root, 'docs/SNAPSHOT.md');
  assert.deepEqual(survey(root, tempDir(t)).docs, {});
});

test('survey finds other doc folders two levels down, sorted', (t) => {
  const root = tempDir(t);
  dirs(
    root,
    'documentation',
    'adr',
    'ADRs',
    'decisions',
    'wiki',
    'Specs',
    'spec',
    'features',
    'docs/adr',
    'docs/specs',
    'packages/docs',
  );
  assert.deepEqual(survey(root, tempDir(t)).otherDocDirs, [
    'ADRs',
    'Specs',
    'adr',
    'decisions',
    'docs/adr',
    'docs/specs',
    'documentation',
    'features',
    'packages/docs',
    'spec',
    'wiki',
  ]);
});

test('survey leaves out the standard docs, dot-folders, node_modules, files and deeper folders', (t) => {
  const root = tempDir(t);
  dirs(
    root,
    'docs/features',
    'docs/codebase',
    '.github/docs',
    '.docs',
    'node_modules/pkg/docs',
    'node_modules/docs',
    'packages/web/docs',
    'src/components',
  );
  write(root, 'wiki', 'a file');
  assert.deepEqual(survey(root, tempDir(t)).otherDocDirs, []);
});

// ---------------------------------------------------------------- skills and commands

test('survey finds doc-sync skills and commands in the project and the home', (t) => {
  const root = tempDir(t);
  const home = tempDir(t);
  const command = write(root, '.claude/commands/docsync.md', 'No front matter at all.');
  const skillFile = write(home, '.claude/skills/keep-docs/SKILL.md', skill('keep-docs', 'Syncs docs with the code after a change'));
  const other = write(home, '.claude/skills/sync-db/SKILL.md', skill('sync-db', 'Sync the database schema'));
  const found = survey(root, home);
  assert.deepEqual(found.docSync.sort(), [command, skillFile].sort());
  assert.equal(found.docSync.includes(other), false);
});

test('survey finds progress skills by name or description, in either language', (t) => {
  const root = tempDir(t);
  const home = tempDir(t);
  const byName = write(root, '.claude/skills/todo/SKILL.md', skill('todo', 'Lists things.'));
  const byDescription = write(home, '.claude/skills/status/SKILL.md', skill('status', 'Shows the roadmap and where the work stands'));
  const chinese = write(home, '.claude/commands/jindu.md', skill('jindu', '查看项目进度'));
  const hyphen = write(home, '.claude/skills/tasks/SKILL.md', skill('tasks', 'Keeps the to-do file'));
  write(home, '.claude/skills/lint/SKILL.md', skill('lint', 'Runs the linter'));
  write(home, '.claude/commands/notes.txt', skill('progress', 'not a .md command'));
  assert.deepEqual(
    survey(root, home).progressSkills.sort(),
    [byName, byDescription, chinese, hyphen].sort(),
  );
});

test('survey reads front matter with CRLF line ends and a byte order mark', (t) => {
  const root = tempDir(t);
  const file = write(
    root,
    '.claude/skills/x/SKILL.md',
    '\uFEFF---\r\nname: x\r\ndescription: Report progress\r\n---\r\nBody\r\n',
  );
  assert.deepEqual(survey(root, tempDir(t)).progressSkills, [file]);
});

test('survey uses the folder or file name when front matter has no name', (t) => {
  const root = tempDir(t);
  const file = write(root, '.claude/skills/roadmap/SKILL.md', '---\ndescription: Lists things\n---\n');
  assert.deepEqual(survey(root, tempDir(t)).progressSkills, [file]);
});

test('survey skips a skills folder entry with no SKILL.md', (t) => {
  const root = tempDir(t);
  dirs(root, '.claude/skills/progress');
  write(root, '.claude/skills/progress/README.md', 'progress');
  assert.deepEqual(survey(root, tempDir(t)).progressSkills, []);
});

// ---------------------------------------------------------------- hooks

test('survey finds every kind of pre-push hook', (t) => {
  const root = tempDir(t);
  write(root, '.git/hooks/pre-push', '#!/bin/sh');
  write(root, '.husky/pre-push', 'npm test');
  write(root, 'lefthook.yml', 'pre-push:');
  write(root, 'lefthook.yaml', 'pre-push:');
  write(root, '.lefthook.yml', 'pre-push:');
  write(root, '.pre-commit-config.yaml', 'default_install_hook_types: [pre-commit, pre-push]\n');
  assert.deepEqual(survey(root, tempDir(t)).prePush, [
    '.git/hooks/pre-push',
    '.husky/pre-push',
    'lefthook.yml',
    'lefthook.yaml',
    '.lefthook.yml',
    '.pre-commit-config.yaml',
  ]);
});

test('survey ignores sample hooks and a pre-commit config without pre-push', (t) => {
  const root = tempDir(t);
  write(root, '.git/hooks/pre-push.sample', '#!/bin/sh');
  write(root, '.husky/pre-commit', 'npm test');
  write(root, '.pre-commit-config.yaml', 'repos: []\n');
  assert.deepEqual(survey(root, tempDir(t)).prePush, []);
});

// ---------------------------------------------------------------- CLAUDE.md

test('survey tells whether CLAUDE.md exists and holds the unbranch block', (t) => {
  const root = tempDir(t);
  write(root, 'CLAUDE.md', '# Rules\n');
  assert.deepEqual(survey(root, tempDir(t)).claudeMd, { exists: true, hasBlock: false });
  write(root, 'CLAUDE.md', '# Rules\n<!-- unbranch -->\nx\n<!-- /unbranch -->\n');
  assert.deepEqual(survey(root, tempDir(t)).claudeMd, { exists: true, hasBlock: true });
});

// ---------------------------------------------------------------- MCP servers in ~/.claude.json

const SECRET = 'sk-SECRET-never-read';

function claudeJson(root) {
  return {
    oauthAccount: { emailAddress: 'someone@example.com', accessToken: SECRET },
    primaryApiKey: SECRET,
    mcpServers: {
      unbranch: { type: 'http', url: 'https://api.unbranch.ai/mcp', headers: { Authorization: `Bearer ${SECRET}` } },
      'unbranch-dev': { type: 'http', url: 'https://API-DEV.unbranch.ai/mcp', headers: { 'X-Api-Key': SECRET } },
      github: { type: 'http', url: 'https://api.githubcopilot.com/mcp/', headers: { Authorization: SECRET } },
      local: { command: 'node', args: ['server.js', '--key', SECRET], env: { API_KEY: SECRET } },
    },
    projects: {
      // Claude Code's own spelling: forward slashes, a trailing slash, and
      // (off Linux) another case.
      [projectKey(root)]: {
        allowedTools: [SECRET],
        mcpServers: {
          unbranch: { type: 'http', url: 'https://old.example/mcp', headers: { Authorization: SECRET } },
          team: { type: 'sse', url: 'https://unbranch.example.com/mcp', env: { TOKEN: SECRET } },
        },
      },
      '/somewhere/else': {
        mcpServers: { unbranch: { type: 'http', url: 'https://elsewhere.example/mcp' } },
      },
    },
  };
}

test('survey takes the unbranch servers from ~/.claude.json, names and urls only', (t) => {
  const root = tempDir(t);
  const home = tempDir(t);
  write(home, '.claude.json', claudeJson(root));
  const { mcp } = survey(root, home);
  assert.deepEqual(mcp, {
    local: 'https://old.example/mcp',
    user: 'https://api.unbranch.ai/mcp',
    others: [
      { scope: 'local', name: 'team', url: 'https://unbranch.example.com/mcp' },
      { scope: 'user', name: 'unbranch-dev', url: 'https://API-DEV.unbranch.ai/mcp' },
    ],
  });
});

test('survey never returns a key, header, token or account from ~/.claude.json', (t) => {
  const root = tempDir(t);
  const home = tempDir(t);
  write(home, '.claude.json', claudeJson(root));
  const text = JSON.stringify(survey(root, home));
  assert.equal(text.includes('SECRET'), false, text);
  assert.equal(text.includes('someone@example.com'), false, text);
  assert.doesNotMatch(text, /headers|Authorization|env|oauth|args/i);
});

test('survey marks an "unbranch" server that is not http', (t) => {
  const root = tempDir(t);
  const home = tempDir(t);
  write(home, '.claude.json', { mcpServers: { unbranch: { command: 'unbranch-mcp' } } });
  assert.equal(survey(root, home).mcp.user, '(not an http server)');
});

test('survey matches the project path whatever its slashes', (t) => {
  const root = tempDir(t);
  const home = tempDir(t);
  const key = `${root.split('\\').join('/')}//`;
  write(home, '.claude.json', {
    projects: { [key]: { mcpServers: { unbranch: { type: 'http', url: 'https://x.example/mcp' } } } },
  });
  assert.equal(survey(root, home).mcp.local, 'https://x.example/mcp');
});

test('survey compares the project path case-sensitively on Linux only', (t) => {
  const root = tempDir(t);
  const home = tempDir(t);
  const swapped = root.replace(/[a-z]/gi, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()));
  write(home, '.claude.json', {
    projects: { [swapped]: { mcpServers: { unbranch: { type: 'http', url: 'https://x.example/mcp' } } } },
  });
  assert.equal(
    survey(root, home).mcp.local,
    process.platform === 'linux' ? undefined : 'https://x.example/mcp',
  );
});

test('survey ignores another project in ~/.claude.json', (t) => {
  const root = tempDir(t);
  const home = tempDir(t);
  write(home, '.claude.json', {
    projects: { [`${root}-other`]: { mcpServers: { unbranch: { type: 'http', url: 'https://x.example/mcp' } } } },
  });
  assert.equal(survey(root, home).mcp.local, undefined);
});

test('survey treats an unreadable ~/.claude.json as no servers', (t) => {
  const root = tempDir(t);
  for (const content of ['{ not json', 'null', '[]', '{"mcpServers":"x","projects":null}']) {
    const home = tempDir(t);
    write(home, '.claude.json', content);
    assert.deepEqual(survey(root, home).mcp, { local: undefined, user: undefined, others: [] }, content);
  }
});

test('survey reads a ~/.claude.json that starts with a byte order mark', (t) => {
  const root = tempDir(t);
  const home = tempDir(t);
  write(home, '.claude.json', `\uFEFF${JSON.stringify({ mcpServers: { unbranch: { type: 'http', url: 'https://u.example/mcp' } } })}`);
  assert.equal(survey(root, home).mcp.user, 'https://u.example/mcp');
});

// ---------------------------------------------------------------- the plugin

for (const file of ['settings.json', 'settings.local.json']) {
  test(`survey sees the plugin enabled in .claude/${file}`, (t) => {
    const root = tempDir(t);
    write(root, `.claude/${file}`, { enabledPlugins: { 'unbranch@unbranch-kit': true } });
    assert.equal(survey(root, tempDir(t)).pluginInstalled, true);
  });
}

test('survey does not count a disabled plugin, another plugin or unreadable settings', (t) => {
  for (const content of [
    { enabledPlugins: { 'unbranch@unbranch-kit': false } },
    { enabledPlugins: { 'unbranch@elsewhere': true } },
    '{ not json',
  ]) {
    const root = tempDir(t);
    write(root, '.claude/settings.json', content);
    assert.equal(survey(root, tempDir(t)).pluginInstalled, false, JSON.stringify(content));
  }
});

test('survey does not count the plugin enabled only in the home settings', (t) => {
  const root = tempDir(t);
  const home = tempDir(t);
  write(home, '.claude/settings.json', { enabledPlugins: { 'unbranch@unbranch-kit': true } });
  assert.equal(survey(root, home).pluginInstalled, false);
});

const marketplace = (autoUpdate) => ({
  extraKnownMarketplaces: { 'unbranch-kit': { source: { source: 'github', repo: 'TYU-Zeng/unbranch-kit' }, autoUpdate } },
});

test('survey reads autoUpdate on the marketplace, the local settings first', (t) => {
  const root = tempDir(t);
  write(root, '.claude/settings.json', marketplace(true));
  assert.equal(survey(root, tempDir(t)).pluginAutoUpdate, true);
  write(root, '.claude/settings.local.json', marketplace(false));
  assert.equal(survey(root, tempDir(t)).pluginAutoUpdate, false);
});

test('survey leaves autoUpdate unset when no settings give it a boolean', (t) => {
  for (const content of [{}, marketplace('yes'), { extraKnownMarketplaces: { other: { autoUpdate: true } } }, '{ not json']) {
    const root = tempDir(t);
    write(root, '.claude/settings.json', content);
    assert.equal(survey(root, tempDir(t)).pluginAutoUpdate, undefined, JSON.stringify(content));
  }
});

test("survey takes this project's copy of the plugin from Claude Code's record, then the user's", (t) => {
  const root = tempDir(t);
  const home = tempDir(t);
  const record = (...installs) =>
    write(home, '.claude/plugins/installed_plugins.json', { version: 2, plugins: { 'unbranch@unbranch-kit': installs } });

  record({ scope: 'project', projectPath: tempDir(t), version: '0.1.0' }, { scope: 'user', version: '0.2.0' });
  assert.deepEqual(survey(root, home).pluginCopy, { version: '0.2.0', scope: 'user' });

  record({ scope: 'user', version: '0.2.0' }, { scope: 'local', projectPath: projectKey(root), version: '0.3.0' });
  assert.deepEqual(survey(root, home).pluginCopy, { version: '0.3.0', scope: 'local' });

  record({ scope: 'project', projectPath: tempDir(t), version: '0.1.0' });
  assert.equal(survey(root, home).pluginCopy, undefined, "another project's copy is not this one's");

  write(home, '.claude/plugins/installed_plugins.json', '{ not json');
  assert.equal(survey(root, home).pluginCopy, undefined);
  assert.equal(survey(root, undefined).pluginCopy, undefined);
});

// ---------------------------------------------------------------- this round's additions

for (const indicator of ['>', '|', '>-', '|+']) {
  test(`survey reads a "description: ${indicator}" block from the indented lines after it`, (t) => {
    const root = tempDir(t);
    const file = write(
      root,
      '.claude/skills/helper/SKILL.md',
      `---\nname: helper\ndescription: ${indicator}\n  Answers questions about\n\n  where the work stands.\nallowed-tools: Read\n---\nprogress is not in the front matter name\n`,
    );
    assert.deepEqual(survey(root, tempDir(t)).progressSkills, [file]);
  });
}

test('survey stops a folded description at the next key', (t) => {
  const root = tempDir(t);
  write(
    root,
    '.claude/skills/helper/SKILL.md',
    '---\nname: helper\ndescription: >\n  Formats code.\nnotes: progress\n---\n',
  );
  assert.deepEqual(survey(root, tempDir(t)).progressSkills, []);
});

test('survey reads a doc-sync command whose description is a literal block with CRLF', (t) => {
  const root = tempDir(t);
  const file = write(root, '.claude/commands/keep.md', '---\r\ndescription: |\r\n  Sync the docs\r\n  after a change\r\n---\r\n');
  assert.deepEqual(survey(root, tempDir(t)).docSync, [file]);
});

test('survey adds the pre-push hook under core.hooksPath', (t) => {
  const root = tempDir(t);
  write(root, '.git/config', '[core]\n\trepositoryformatversion = 0\n\thooksPath = tools/hooks/\n');
  write(root, 'tools/hooks/pre-push', '#!/bin/sh');
  assert.deepEqual(survey(root, tempDir(t)).prePush, ['tools/hooks/pre-push']);
});

test('survey reads core.hooksPath with CRLF and a byte order mark', (t) => {
  const root = tempDir(t);
  write(root, '.git/config', `${BOM}[core]\r\n\thooksPath = tools/hooks\r\n`);
  write(root, 'tools/hooks/pre-push', '#!/bin/sh');
  assert.deepEqual(survey(root, tempDir(t)).prePush, ['tools/hooks/pre-push']);
});

test(
  'survey reads core.hooksPath the way git writes it: backslashes escaped, or quoted',
  (t) => {
    // What `git config core.hooksPath 'tools\hooks'` and a quoted value write.
    // The backslash is a separator only on Windows; elsewhere `tools\hooks` is
    // one directory with a backslash in its name, and that is where git looks
    // — so the hook goes where git on this platform would find it. Either way
    // the escape has to be undone, or the path names `tools\\hooks` and misses.
    const escaped =
      process.platform === 'win32' ? 'tools/hooks/pre-push' : 'tools\\hooks/pre-push';
    for (const [value, hook] of [
      ['tools\\\\hooks', escaped],
      ['"tools/hooks"', 'tools/hooks/pre-push'],
    ]) {
      const root = tempDir(t);
      write(root, '.git/config', `[core]\n\thooksPath = ${value}\n`);
      write(root, hook, '#!/bin/sh');
      assert.deepEqual(survey(root, tempDir(t)).prePush, ['tools/hooks/pre-push'], value);
    }
  },
);

test(
  'survey lists .git/hooks/pre-push once when core.hooksPath is .git/hooks',
  (t) => {
    const root = tempDir(t);
    write(root, '.git/config', '[core]\n\thooksPath = .git/hooks\n');
    write(root, '.git/hooks/pre-push', '#!/bin/sh');
    assert.deepEqual(survey(root, tempDir(t)).prePush, ['.git/hooks/pre-push']);
  },
);

test('survey ignores core.hooksPath when that folder has no pre-push', (t) => {
  const root = tempDir(t);
  write(root, '.git/config', '[core]\n\thooksPath = tools/hooks\n');
  write(root, 'tools/hooks/pre-commit', '#!/bin/sh');
  assert.deepEqual(survey(root, tempDir(t)).prePush, []);
});

test('survey lists .husky/pre-push once when core.hooksPath is .husky', (t) => {
  const root = tempDir(t);
  write(root, '.git/config', '[core]\n\thooksPath = .husky\n');
  write(root, '.husky/pre-push', 'npm test');
  assert.deepEqual(survey(root, tempDir(t)).prePush, ['.husky/pre-push']);
});

test('survey reads project settings that start with a byte order mark', (t) => {
  const root = tempDir(t);
  write(root, '.claude/settings.json', `${BOM}${JSON.stringify({ enabledPlugins: { 'unbranch@unbranch-kit': true } })}`);
  assert.equal(survey(root, tempDir(t)).pluginInstalled, true);
});
