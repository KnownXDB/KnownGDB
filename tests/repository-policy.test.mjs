import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const policy = fileURLToPath(new URL('../scripts/repository-policy.mjs', import.meta.url));
function fixture(files, args = [], update) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'knowngdb-policy-test-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      writeFileSync(path.join(root, name), content);
    }
    execFileSync('git', ['-c', 'core.autocrlf=false', 'add', '--all'], { cwd: root });
    update?.(root);
    return spawnSync(process.execPath, [policy, ...args], { cwd: root, encoding: 'utf8' });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('accepts linked UTF-8/LF source and rejects broken documentation links', () => {
  assert.equal(fixture({ 'README.md': '[Rules](docs/rules.md)\n', 'docs/rules.md': '# Rules\n' }).status, 0);
  assert.notEqual(fixture({ 'README.md': '[Rules](missing.md)\n' }).status, 0);
});
test('rejects generated paths and private environment files', () => {
  for (const name of ['.env.local', 'build/output.js', 'test-results/output.txt', 'image.png', 'private/config.json']) {
    assert.notEqual(fixture({ [name]: 'unpublishable\n' }).status, 0, name);
  }
  assert.equal(fixture({ '.env.example': 'API_URL=\n' }).status, 0);
});
test('rejects binary, invalid encoding, CRLF and unresolved conflicts', () => {
  for (const content of [Buffer.from([0xff, 0x00]), 'text\r\n', '<<<<<<< change\n', 'no newline']) {
    assert.notEqual(fixture({ 'source.txt': content }).status, 0);
  }
});
test('staged checks cannot be bypassed by repairing only the working copy', () => {
  const result = fixture({ 'source.txt': 'invalid\r\n' }, ['--staged'], (root) => {
    writeFileSync(path.join(root, 'source.txt'), 'fixed\n');
  });
  assert.notEqual(result.status, 0);
});
test('workflow actions require immutable commit references', () => {
  assert.notEqual(fixture({ '.github/workflows/check.yml': 'steps:\n  - uses: actions/checkout@v4\n' }).status, 0);
  assert.equal(fixture({ '.github/workflows/check.yml': 'steps:\n  - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n' }).status, 0);
});
