import type { Route } from './+types/api.images';
import { getAdminIdentity } from '~/lib/auth.server';
import { getEnv } from '~/lib/env.server';
import { sameOrigin } from '~/lib/request.server';

// Allowed source types (kept in sync with the bucket's allowed_mime_types in
// 0009_room_images_bucket.sql). Client compresses to webp, but HEIC/other
// decode failures fall through as the original bytes, so accept the common set.
const ALLOWED = new Set(['image/webp', 'image/jpeg', 'image/png', 'image/avif']);
const EXT: Record<string, string> = {
  'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/avif': 'avif',
};
const MAX_BYTES = 2_000_000;

// POST (multipart, one `file` part) → upload to the public `room-images` bucket,
// return the public object URL. Admins only. Upload uses a raw fetch to the
// Storage REST endpoint (not supabase-js .storage.upload(), whose internal
// multipart FormData is a workerd hazard).
export async function action({ request }: Route.ActionArgs) {
  const admin = await getAdminIdentity(request);
  if (!admin) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  if (!sameOrigin(request)) return Response.json({ error: 'Bad origin' }, { status: 403 });

  const file = (await request.formData()).get('file');
  if (!(file instanceof File)) return Response.json({ error: 'file required' }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES) return Response.json({ error: 'File too large' }, { status: 400 });
  if (!ALLOWED.has(file.type)) return Response.json({ error: 'Unsupported image type' }, { status: 400 });

  const env = getEnv();
  // Random key — never the original filename (traversal/collision/unicode), and
  // makes public URLs non-enumerable.
  const key = `${crypto.randomUUID()}.${EXT[file.type]}`;

  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/room-images/${key}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': file.type,
      'Cache-Control': 'max-age=31536000, immutable',
    },
    body: file,
  });
  if (!res.ok) {
    return Response.json({ error: 'Upload failed' }, { status: 502 });
  }

  const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/room-images/${key}`;
  return Response.json({ url: publicUrl }, { status: 201 });
}
