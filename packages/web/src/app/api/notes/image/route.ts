import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {uploadToR2} from '@/lib/r2';
import {randomUUID} from 'crypto';
import {withTracing} from '@/lib/logger';

/** Allowed image MIME types */
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/** Max image upload size: 5MB */
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * POST /api/notes/image
 *
 * Accepts multipart/form-data with:
 *   image: image file (jpeg, png, gif, webp)
 *
 * Returns: { url: string }
 */
export const POST = withTracing('POST /api/notes/image', async (request) => {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('image');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
  }

  // Validate MIME type
  const mimeType = file.type || 'application/octet-stream';
  const isAllowed = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mimeType);
  if (!isAllowed) {
    return NextResponse.json(
      {
        error: `Invalid file type: ${mimeType}. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
      },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `File too large. Maximum size is ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB`,
      },
      { status: 413 }
    );
  }

  // Build a safe R2 key: note-images/{userId}/{uuid}.{ext}
  const ext = MIME_TO_EXT[mimeType] ?? 'jpg';
  const key = `note-images/${user.id}/${randomUUID()}.${ext}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadToR2(key, buffer, mimeType);

    return NextResponse.json({ url });
  } catch (err) {
    console.error('[POST /api/notes/image]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
});
