import {DeleteObjectCommand, PutObjectCommand, S3Client} from '@aws-sdk/client-s3';

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials are not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function getR2BucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error('R2_BUCKET_NAME is not set');
  return bucket;
}

function getR2PublicUrl(): string {
  const url = process.env.R2_PUBLIC_URL;
  if (!url) throw new Error('R2_PUBLIC_URL is not set');
  return url.replace(/\/$/, '');
}

export interface R2UploadResult {
  key: string;
  url: string;
}

/**
 * Upload a file buffer to Cloudflare R2.
 * Returns the object key and public URL.
 */
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<R2UploadResult> {
  const client = getR2Client();
  const bucket = getR2BucketName();
  const publicUrl = getR2PublicUrl();

  const isAudio = contentType.startsWith('audio/');

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // 오디오: 30일 캐시 + Range 요청 지원으로 스트리밍/시킹 성능 개선
      // 이미지: 7일 캐시
      CacheControl: isAudio
        ? 'public, max-age=2592000, immutable'
        : 'public, max-age=604800',
    })
  );

  return {
    key,
    url: `${publicUrl}/${key}`,
  };
}

/**
 * Delete an object from Cloudflare R2 by key.
 */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  const bucket = getR2BucketName();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}

/**
 * Extract the R2 object key from a full public URL.
 * Returns null if the URL doesn't match R2_PUBLIC_URL.
 */
export function extractR2Key(url: string): string | null {
  try {
    const publicUrl = getR2PublicUrl();
    if (!url.startsWith(publicUrl)) return null;
    return url.slice(publicUrl.length + 1); // remove leading "/"
  } catch {
    return null;
  }
}

/** Allowed audio MIME types */
export const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/wav',
  'audio/wave',
  'audio/webm',
  'audio/ogg',
  'audio/aac',
  'audio/x-m4a',
] as const;

/** Max upload size: 200MB */
export const MAX_AUDIO_SIZE_BYTES = 200 * 1024 * 1024;
