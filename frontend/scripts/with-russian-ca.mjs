import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const frontendDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const certificatesDirectory = join(frontendDirectory, 'certs');
const bundlePath = join(certificatesDirectory, 'russian-trusted-ca-bundle.pem');
const [root, intermediate] = await Promise.all([
  readFile(join(certificatesDirectory, 'russian_trusted_root_ca.cer'), 'utf8'),
  readFile(join(certificatesDirectory, 'russian_trusted_sub_ca.cer'), 'utf8'),
]);

await writeFile(bundlePath, `${root.trim()}\n${intermediate.trim()}\n`, 'utf8');

const child = spawn(
  process.execPath,
  [join(frontendDirectory, 'node_modules/next/dist/bin/next'), ...process.argv.slice(2)],
  {
    cwd: frontendDirectory,
    env: { ...process.env, NODE_EXTRA_CA_CERTS: bundlePath },
    stdio: 'inherit',
  },
);

child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
