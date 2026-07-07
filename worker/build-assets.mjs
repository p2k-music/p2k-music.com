// ============================================================
//  Stage ONLY the public site into worker/public/ for Workers Assets.
//  Source of truth = git-tracked files (so untracked working-dir cruft,
//  the backend, git history, docs and secrets are NEVER uploaded).
//  Wrangler runs this automatically ([build].command) before dev/deploy.
//  Hardlinks (instant, no extra disk) with a copy fallback.
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');   // repo root
const OUT = path.resolve(import.meta.dirname, 'public');

// Tracked paths under these prefixes / suffixes are backend-only, never public.
const EXCLUDE_PREFIX = ['server/', 'worker/', '.claude/', '.project-memory/', '.github/'];
const EXCLUDE_EXACT = new Set(['Dockerfile', '.dockerignore', 'render.yaml', '.gitignore', '.gitattributes', '.assetsignore']);
const isPublic = (rel) =>
  !rel.toLowerCase().endsWith('.md') &&
  !rel.endsWith('.zip') &&
  !rel.split('/').some((seg) => seg.startsWith('.')) &&
  !EXCLUDE_EXACT.has(rel) &&
  !EXCLUDE_PREFIX.some((p) => rel.startsWith(p));

let tracked;
try {
  tracked = execSync('git ls-files -z', { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean);
} catch (e) {
  console.error('[build-assets] `git ls-files` failed — is this a git checkout?', e.message);
  process.exit(1);
}

// Empty the staging dir's CONTENTS (not the dir itself — Windows may hold a
// handle on the top folder). Retries ride out transient Defender/indexer locks.
fs.mkdirSync(OUT, { recursive: true });
for (const name of fs.readdirSync(OUT)) {
  fs.rmSync(path.join(OUT, name), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

let files = 0, bytes = 0;
for (const rel of tracked) {
  if (!isPublic(rel)) continue;
  const src = path.join(ROOT, rel);
  let st; try { st = fs.statSync(src); } catch (_) { continue; } // tracked but absent on disk
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try { fs.linkSync(src, dest); } catch (_) { fs.copyFileSync(src, dest); }
  files++; bytes += st.size;
}
console.log(`[build-assets] staged ${files} public files (${(bytes / 1048576).toFixed(1)} MB) → worker/public`);
