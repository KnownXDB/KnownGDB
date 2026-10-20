import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Security tooling is pinned, downloaded outside the repository, and verified.
const version = '8.30.1';
const targets = {
  'win32-x64': ['windows_x64.zip', 'd29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e'],
  'linux-x64': ['linux_x64.tar.gz', '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'],
};
const target = targets[`${process.platform}-${process.arch}`];
if (!target) throw new Error('Scanner supports Windows x64 and Linux x64. Add a reviewed archive checksum for other platforms.');
const temp = mkdtempSync(path.join(os.tmpdir(), 'knowngdb-secret-scan-'));
let stage = 'download';
try {
  const response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_${target[0]}`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Scanner download failed.');
  const archive = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(archive).digest('hex') !== target[1]) throw new Error('Scanner checksum mismatch.');
  const archivePath = path.join(temp, target[0]);
  writeFileSync(archivePath, archive);
  stage = 'archive extraction';
  const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar';
  execFileSync(tar, ['-xf', archivePath, '-C', temp], { stdio: 'pipe' });
  const executable = path.join(temp, process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks');
  const config = path.join(temp, 'rules.toml');
  writeFileSync(config, '[extend]\nuseDefault = true\n');
  const emptyIgnore = path.join(temp, 'ignore');
  writeFileSync(emptyIgnore, '');
  const mode = process.argv.includes('--staged') ? ['git', '.', '--staged'] : ['git', '.', '--log-opts=--all'];
  const flags = ['--config', config, '--gitleaks-ignore-path', emptyIgnore, '--ignore-gitleaks-allow', '--redact', '--no-banner', '--log-level', 'error', '--timeout', '120'];
  stage = 'redacted content scan';
  execFileSync(executable, [...mode, ...flags], { stdio: 'inherit' });
  if (!process.argv.includes('--staged')) {
    // Scan public working candidates in memory. Never copy private .env files,
    // dependencies or build output into reports or a temporary source snapshot.
    // Force-added ignored files are still covered by the Git history/index scan.
    const files = new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean));
    const input = Buffer.concat([...files].flatMap(file => [Buffer.from(`\nFile: ${file}\n`),readFileSync(file),Buffer.from('\n')]));
    execFileSync(executable, ['stdin', ...flags], { input, stdio: ['pipe','inherit','inherit'] });
  }
  console.log('Secret scan passed. Reports and binaries were not saved in the repository.');
} catch {
  console.error(`Secret scan failed during ${stage}. Publication must stop; inspect only redacted diagnostics.`);
  process.exitCode = 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
