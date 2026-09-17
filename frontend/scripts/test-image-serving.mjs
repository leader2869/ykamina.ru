import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { join } from 'node:path';
import sharp from 'sharp';

const portFinder = net.createServer();
await new Promise((resolve) => portFinder.listen(0, '127.0.0.1', resolve));
const port = portFinder.address().port;
await new Promise((resolve) => portFinder.close(resolve));
const base = `http://127.0.0.1:${port}`;
const directory = join(process.cwd(), 'public/media/realflame');
await mkdir(directory, { recursive: true });
const prefix = `route-test-${process.pid}-${Date.now()}`;
const existing = `${prefix}-existing.webp`;
const added = `${prefix}-added.webp`;
const bytes = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#cf9a58' } }).webp().toBuffer();
await writeFile(join(directory, existing), bytes, { flag: 'wx' });
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
server.stdout.on('data', (data) => { output += data; });
server.stderr.on('data', (data) => { output += data; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`${base}/media/realflame/${added}`);
      if (response.status === 404) { ready = true; break; }
    } catch { /* Startup is asynchronous. */ }
    if (server.exitCode !== null) throw new Error(output);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Production server did not start: ${output}`);
  // This file did not exist when Next built its public-file inventory.
  await writeFile(join(directory, added), bytes, { flag: 'wx' });
  for (const filename of [existing, added]) {
    const response = await fetch(`${base}/media/realflame/${filename}`);
    assert.equal(response.status, 200, `${filename}: ${output}`);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
  assert.equal((await fetch(`${base}/media/realflame/${added}`, { method: 'HEAD' })).status, 200);
  for (const filename of ['package.json', '.env', 'missing-image.webp', '%2e%2e%2fpackage.json']) {
    assert.equal((await fetch(`${base}/media/realflame/${filename}`)).status, 404, filename);
  }
  console.log('Existing and newly imported photos work without a restart; invalid paths are rejected.');
} finally {
  server.kill('SIGTERM');
  await Promise.all([existing, added].map((filename) => unlink(join(directory, filename)).catch(() => {})));
}
