/**
 * Vendors the MediaPipe runtime into `public/vendor/` so the app never pulls
 * executable code from a third-party CDN at runtime.
 *
 * - the wasm/glue files are copied out of the installed npm package, so they
 *   always match the version in package-lock.json
 * - the hand landmarker model is downloaded once and checked against a pinned
 *   SHA-256 before it is written
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/vendor/mediapipe');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MODEL_SHA256 = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function copyWasm() {
  // The package does not export ./package.json, so walk up from its entry point.
  let pkg = dirname(require.resolve('@mediapipe/tasks-vision'));
  while (!existsSync(resolve(pkg, 'wasm'))) {
    const parent = dirname(pkg);
    if (parent === pkg) throw new Error('Could not locate the @mediapipe/tasks-vision wasm directory');
    pkg = parent;
  }
  cpSync(resolve(pkg, 'wasm'), resolve(outDir, 'wasm'), { recursive: true });
}

async function downloadModel() {
  const modelPath = resolve(outDir, 'hand_landmarker.task');
  if (existsSync(modelPath) && sha256(readFileSync(modelPath)) === MODEL_SHA256) return;

  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error(`Model download failed: ${response.status} ${response.statusText}`);
  const bytes = Buffer.from(await response.arrayBuffer());

  const digest = sha256(bytes);
  if (digest !== MODEL_SHA256) {
    throw new Error(`Model checksum mismatch: expected ${MODEL_SHA256}, got ${digest}`);
  }
  writeFileSync(modelPath, bytes);
}

mkdirSync(outDir, { recursive: true });
copyWasm();
await downloadModel();
