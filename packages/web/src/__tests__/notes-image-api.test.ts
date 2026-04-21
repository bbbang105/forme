import {beforeEach, describe, expect, it, vi} from 'vitest';

// --- Mocks ---

let _mockUser: {id: string} | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    auth: {
      getUser: vi.fn().mockImplementation(async () => ({
        data: {user: _mockUser},
        error: _mockUser ? null : new Error('Not authenticated'),
      })),
    },
  })),
}));

const {mockUpload} = vi.hoisted(() => ({
  mockUpload: vi.fn().mockResolvedValue({url: 'https://cdn.example.com/foo.jpg'}),
}));

vi.mock('@/lib/r2', () => ({
  uploadToR2: mockUpload,
}));

function setMockUser(id: string | null) {
  _mockUser = id ? {id} : null;
}

/**
 * Build a minimal request-like object. We bypass `new Request(..., {body: FormData})`
 * because serialize/parse round-trip creates File objects that fail
 * `instanceof File` in jsdom (different class from global.File).
 * Includes `url` + `method` because `withTracing` wrapper reads them.
 */
function makeRequest(formData: FormData | null, formDataError?: Error) {
  return {
    url: 'http://localhost/api/notes/image',
    method: 'POST',
    formData: async () => {
      if (formDataError) throw formDataError;
      return formData!;
    },
  };
}

function makeFormData(file: File | null, fieldName = 'image'): FormData {
  const fd = new FormData();
  if (file) fd.append(fieldName, file);
  return fd;
}

describe('POST /api/notes/image', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockUser(null);
  });

  it('returns 401 when not authenticated', async () => {
    const {POST} = await import('@/app/api/notes/image/route');
    const fd = makeFormData(new File(['x'], 'a.png', {type: 'image/png'}));
    const res = await POST(makeRequest(fd) as never);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when no image field provided', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/notes/image/route');
    const res = await POST(makeRequest(new FormData()) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('No image');
  });

  it('returns 400 for disallowed MIME type', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/notes/image/route');
    const file = new File(['<svg/>'], 'x.svg', {type: 'image/svg+xml'});
    const res = await POST(makeRequest(makeFormData(file)) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid file type/);
  });

  it('returns 413 for files exceeding 5MB', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/notes/image/route');
    // Create a File with size attribute larger than limit by mocking size
    const oversized = new File([new Uint8Array(1024)], 'big.png', {type: 'image/png'});
    Object.defineProperty(oversized, 'size', {value: 6 * 1024 * 1024});
    const res = await POST(makeRequest(makeFormData(oversized)) as never);
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/too large/i);
  });

  it('returns 200 + url on success, uploads to R2 with user-scoped key', async () => {
    setMockUser('user-42');
    const {POST} = await import('@/app/api/notes/image/route');
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'pic.png', {type: 'image/png'});
    const res = await POST(makeRequest(makeFormData(file)) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://cdn.example.com/foo.jpg');
    expect(mockUpload).toHaveBeenCalledOnce();
    const [key, buffer, mime] = mockUpload.mock.calls[0];
    expect(key).toMatch(/^note-images\/user-42\/[0-9a-f-]+\.png$/);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(mime).toBe('image/png');
  });

  it('returns 500 when R2 upload fails', async () => {
    setMockUser('user-1');
    mockUpload.mockRejectedValueOnce(new Error('network'));
    const {POST} = await import('@/app/api/notes/image/route');
    const file = new File([new Uint8Array(8)], 'pic.jpg', {type: 'image/jpeg'});
    const res = await POST(makeRequest(makeFormData(file)) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Upload failed');
  });

  it('accepts all 4 allowed MIME types (jpeg/png/gif/webp)', async () => {
    setMockUser('user-1');
    const {POST} = await import('@/app/api/notes/image/route');
    for (const mime of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) {
      const file = new File([new Uint8Array(4)], 'a', {type: mime});
      const res = await POST(makeRequest(makeFormData(file)) as never);
      expect(res.status, `mime=${mime}`).toBe(200);
    }
  });
});
