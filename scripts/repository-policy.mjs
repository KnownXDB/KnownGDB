import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const staged = process.argv.includes('--staged');
const files = git('ls-files', '-z').split('\0').filter(Boolean);
const stagedFiles = new Set(git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0'));
const errors = [];
const forbidden = /(^|\/)(node_modules|dist|build|coverage|artifacts|uploads|screenshots|videos|test-results|playwright-report|blob-report|backups|data|secrets|private|\.local|\.wrangler|\.netlify|\.cache|\.git)(\/|$)|(^|\/)\.env(?:\.|$)|(^|\/)\.dev\.vars(?:\.|$)|\.(?:pem|key|p12|pfx|jks|keystore|dump|backup|sqlite3?|db|har|log|zip|gz|exe|dll|png|jpe?g|ico|webp|mp4|webm)$/i;
const utf8 = new TextDecoder('utf-8', { fatal: true });

for (const file of files) {
  if (staged && !stagedFiles.has(file)) continue;
  if ((forbidden.test(file) && !/(^|\/)\.env\.example$/.test(file)) || /(^|\/)\.gitleaks/.test(file)) {
    errors.push(`${file}: forbidden tracked path`);
    continue;
  }
  const bytes = staged ? execFileSync('git', ['show', `:${file}`]) : readFileSync(file);
  if (bytes.length > 512 * 1024) { errors.push(`${file}: exceeds reviewed source-file size limit`); continue; }
  let content;
  try { content = utf8.decode(bytes); } catch { errors.push(`${file}: invalid UTF-8 or binary`); continue; }
  if (bytes.includes(0) || content.includes('\r') || content.startsWith('\uFEFF')) errors.push(`${file}: requires UTF-8 without BOM and LF`);
  if (content && !content.endsWith('\n')) errors.push(`${file}: missing final newline`);
  if (/^(?:<{7}|={7}|>{7})(?: |$)/m.test(content)) errors.push(`${file}: conflict marker`);
  if (file.endsWith('.md')) {
    for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
      const link = match[1].split('#')[0];
      if (!link || /^(?:https?:|mailto:)/.test(link)) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), link));
      if (!files.includes(target) && !files.some((name) => name.startsWith(`${target}/`))) errors.push(`${file}: broken local link`);
    }
  }
  if (file.startsWith('.github/workflows/')) {
    if (/^\s*(?:-\s+)?uses:\s*[^\s]+@(?![a-f0-9]{40}(?:\s|$))/m.test(content)) errors.push(`${file}: action must use full commit SHA`);
    if (/^\s*(?:schedule|workflow_run):/m.test(content)) errors.push(`${file}: unexpected automatic workflow trigger`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Repository policy passed (${staged ? 'staged snapshot' : `${files.length} tracked files`}).`);
