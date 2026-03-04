import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {ALLOWED_AUDIO_TYPES, MAX_AUDIO_SIZE_BYTES, uploadToR2} from '@/lib/r2';
import {randomUUID} from 'crypto';
import {withTracing} from '@/lib/logger';

// Vercel serverless: 대용량 업로드를 위한 타임아웃 확장 (5분)
export const maxDuration = 300;

/**
 * POST /api/podcast/upload
 *
 * Accepts multipart/form-data with:
 *   file: audio file
 *
 * Returns: { audioUrl, duration?, fileSize }
 */
export const POST = withTracing('POST /api/podcast/upload', async (request) => {
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

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
  }

  // Validate MIME type
  const mimeType = file.type || 'application/octet-stream';
  const isAllowed = (ALLOWED_AUDIO_TYPES as readonly string[]).includes(mimeType);
  if (!isAllowed) {
    return NextResponse.json(
      {
        error: `Invalid file type: ${mimeType}. Allowed types: ${ALLOWED_AUDIO_TYPES.join(', ')}`,
      },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `File too large. Maximum size is ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024}MB`,
      },
      { status: 413 }
    );
  }

  // Build a safe R2 key: podcast/{userId}/{uuid}.{ext}
  const ext = getExtension(mimeType);
  const key = `podcast/${user.id}/${randomUUID()}.${ext}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { url } = await uploadToR2(key, buffer, mimeType);

    return NextResponse.json({
      audioUrl: url,
      fileSize: file.size,
    });
  } catch (err) {
    console.error('[POST /api/podcast/upload]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
});

function getExtension(mimeType: string): string {
  // MIME 기반으로만 확장자 결정 (파일명 기반은 위험)
  const map: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
  };
  return map[mimeType] ?? 'audio';
}
