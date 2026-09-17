import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Next's public-file inventory is built at startup. Supplier imports also write
// files while the app is running, so serve newly added photos from the same
// persistent directory without requiring a restart after every import.
export async function GET(_request: Request, { params }: { params: { filename: string } }) {
  const filename = params.filename;
  if (!/^[a-zA-Z0-9_-]{1,180}\.(webp|jpe?g|png)$/i.test(filename)) {
    return new Response(null, { status: 404 });
  }

  try {
    const bytes = await readFile(join(process.cwd(), 'public/media/realflame', filename));
    const extension = filename.split('.').pop()?.toLowerCase();
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': extension === 'webp' ? 'image/webp' : extension === 'png' ? 'image/png' : 'image/jpeg',
        'Content-Length': String(bytes.length),
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    console.error('Product image could not be read:', code || 'unknown filesystem error');
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
