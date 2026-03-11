'use client';

import {useCallback, useReducer, useRef} from 'react';
import {CheckCircle2, FileAudio, Loader2, Upload, X} from 'lucide-react';
import {cn} from '@/lib/utils';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,} from '@/components/ui/dialog';
import {ALLOWED_AUDIO_TYPES, MAX_AUDIO_SIZE_BYTES} from '@/lib/r2';
import type {Episode} from './player-context';

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (episode: Episode) => void;
}

type Step = 'idle' | 'uploading' | 'creating' | 'done' | 'error';

interface UploadState {
  file: File | null;
  isDragging: boolean;
  title: string;
  description: string;
  step: Step;
  uploadProgress: number;
  errorMsg: string;
}

type UploadAction =
  | { type: 'SET_FILE'; file: File | null }
  | { type: 'SET_DRAGGING'; isDragging: boolean }
  | { type: 'SET_TITLE'; title: string }
  | { type: 'SET_DESCRIPTION'; description: string }
  | { type: 'SET_STEP'; step: Step }
  | { type: 'SET_PROGRESS'; progress: number }
  | { type: 'SET_ERROR'; errorMsg: string }
  | { type: 'RESET' };

const initialState: UploadState = {
  file: null,
  isDragging: false,
  title: '',
  description: '',
  step: 'idle',
  uploadProgress: 0,
  errorMsg: '',
};

function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'SET_FILE':
      return { ...state, file: action.file };
    case 'SET_DRAGGING':
      return { ...state, isDragging: action.isDragging };
    case 'SET_TITLE':
      return { ...state, title: action.title };
    case 'SET_DESCRIPTION':
      return { ...state, description: action.description };
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SET_PROGRESS':
      return { ...state, uploadProgress: action.progress };
    case 'SET_ERROR':
      return { ...state, errorMsg: action.errorMsg };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function UploadDialog({ open, onOpenChange, onSuccess }: UploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, dispatch] = useReducer(uploadReducer, initialState);
  const { file, isDragging, title, description, step, uploadProgress, errorMsg } = state;
  // Ref to track progress for the simulated interval (avoids stale closure)
  const progressRef = useRef(0);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const handleClose = useCallback(() => {
    if (step === 'uploading' || step === 'creating') return;
    reset();
    onOpenChange(false);
  }, [step, reset, onOpenChange]);

  const validateFile = (f: File): string | null => {
    if (!(ALLOWED_AUDIO_TYPES as readonly string[]).includes(f.type)) {
      return `지원하지 않는 파일 형식입니다. MP3, WAV, M4A, OGG, AAC 파일을 업로드해주세요.`;
    }
    if (f.size > MAX_AUDIO_SIZE_BYTES) {
      return `파일 크기가 너무 큽니다. 최대 ${MAX_AUDIO_SIZE_BYTES / 1024 / 1024}MB까지 업로드 가능합니다.`;
    }
    return null;
  };

  const applyFile = useCallback((f: File) => {
    const err = validateFile(f);
    if (err) {
      dispatch({ type: 'SET_ERROR', errorMsg: err });
      return;
    }
    dispatch({ type: 'SET_ERROR', errorMsg: '' });
    dispatch({ type: 'SET_FILE', file: f });
    // Auto-fill title from filename (remove extension)
    if (!title) {
      const name = f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      dispatch({ type: 'SET_TITLE', title: name });
    }
  }, [title]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dispatch({ type: 'SET_DRAGGING', isDragging: false });
      const f = e.dataTransfer.files[0];
      if (f) applyFile(f);
    },
    [applyFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    dispatch({ type: 'SET_DRAGGING', isDragging: true });
  };

  const handleDragLeave = () => dispatch({ type: 'SET_DRAGGING', isDragging: false });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    progressRef.current = 0;
    dispatch({ type: 'SET_STEP', step: 'uploading' });
    dispatch({ type: 'SET_PROGRESS', progress: 0 });

    let progressInterval: ReturnType<typeof setInterval> | null = null;
    try {
      // Upload file to R2 via API
      const formData = new FormData();
      formData.append('file', file);

      // Simulate progress during upload (XHR would give real progress)
      progressInterval = setInterval(() => {
        const next = Math.min(progressRef.current + 5, 85);
        progressRef.current = next;
        dispatch({ type: 'SET_PROGRESS', progress: next });
      }, 300);

      const uploadRes = await fetch('/api/podcast/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      progressInterval = null;
      progressRef.current = 95;
      dispatch({ type: 'SET_PROGRESS', progress: 95 });

      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({ error: '업로드 실패' }));
        throw new Error(err.error || '업로드에 실패했습니다.');
      }

      const { audioUrl, fileSize } = await uploadRes.json();

      // Create episode record
      dispatch({ type: 'SET_STEP', step: 'creating' });

      const createRes = await fetch('/api/podcast/episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          audioUrl,
          fileSize,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({ error: '생성 실패' }));
        throw new Error(err.error || '에피소드 생성에 실패했습니다.');
      }

      const episode = await createRes.json();
      progressRef.current = 100;
      dispatch({ type: 'SET_PROGRESS', progress: 100 });
      dispatch({ type: 'SET_STEP', step: 'done' });

      setTimeout(() => {
        onSuccess(episode);
        handleClose();
      }, 800);
    } catch (err) {
      dispatch({ type: 'SET_ERROR', errorMsg: err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.' });
      dispatch({ type: 'SET_STEP', step: 'error' });
    } finally {
      if (progressInterval) clearInterval(progressInterval);
    }
  };

  const isSubmitting = step === 'uploading' || step === 'creating';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">🎙️</span>
            에피소드 업로드
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File dropzone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={isSubmitting}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => !file && fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!file) fileInputRef.current?.click(); } }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                'w-full rounded-xl border-2 border-dashed p-6 text-center',
                'transition-all duration-200',
                isDragging
                  ? 'border-primary bg-primary/5 scale-[1.02]'
                  : file
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-accent/40 cursor-pointer',
                isSubmitting && 'pointer-events-none opacity-60'
              )}
            >
              {file ? (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <FileAudio className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-sm font-medium break-all line-clamp-2">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(file.size)}</p>
                  </div>
                  {!isSubmitting && (
                    <button
                      type="button"
                      onClick={() => { dispatch({ type: 'SET_FILE', file: null }); dispatch({ type: 'SET_TITLE', title: '' }); }}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      aria-label="파일 제거"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      클릭하거나 파일을 드래그하세요
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      MP3, WAV, M4A, OGG, AAC · 최대 200MB
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {isSubmitting && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span aria-live="polite">{step === 'uploading' ? '업로드 중...' : '에피소드 생성 중...'}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={uploadProgress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="업로드 진행률"
                className="h-1.5 rounded-full bg-border overflow-hidden"
              >
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Done state */}
          {step === 'done' && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              업로드 완료!
            </div>
          )}

          {/* Error */}
          {(step === 'error' || step === 'idle') && errorMsg && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {errorMsg}
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="ep-title">제목 *</Label>
            <Input
              id="ep-title"
              value={title}
              onChange={(e) => dispatch({ type: 'SET_TITLE', title: e.target.value })}
              placeholder="에피소드 제목을 입력하세요"
              disabled={isSubmitting}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="ep-desc">설명 (선택)</Label>
            <textarea
              id="ep-desc"
              value={description}
              onChange={(e) => dispatch({ type: 'SET_DESCRIPTION', description: e.target.value })}
              placeholder="에피소드에 대한 간단한 설명..."
              disabled={isSubmitting}
              rows={3}
              className={cn(
                'flex w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50 resize-none'
              )}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={!file || !title.trim() || isSubmitting || step === 'done'}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {step === 'uploading' ? '업로드 중...' : '생성 중...'}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  업로드
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
