import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extra = process.argv.slice(2);

const ocr = spawn(
  process.execPath,
  [
    '--experimental-strip-types',
    '--disable-warning=ExperimentalWarning',
    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    join(root, 'scripts/ocr-proxy.mjs'),
  ],
  {
    cwd: root,
    stdio: 'inherit',
  },
);

const expo = spawn('npx', ['expo', 'start', ...extra], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

function shutdown() {
  ocr.kill();
  expo.kill();
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});
process.on('SIGTERM', shutdown);
expo.on('exit', (code) => {
  ocr.kill();
  process.exit(code ?? 0);
});
ocr.on('exit', (code, signal) => {
  if (signal) return;
  if (code) process.stderr.write(`OCR helper exited (${code})\n`);
});
