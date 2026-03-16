'use client';

import {useCallback, useRef, useState} from 'react';
import {Loader2, CheckCircle2, AlertCircle, Link2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Step = 'idle' | 'meta' | 'transcript' | 'summarize' | 'done' | 'error';

const STEP_LABELS: Record<Step, string> = {
  idle: '',
  meta: '영상 정보 가져오는 중...',
  transcript: '자막 추출 중...',
  summarize: 'AI 요약 생성 중...',
  done: '요약 완료!',
  error: '오류 발생',
};

interface AddUrlDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function AddUrlDialog({open, onOpenChange, onComplete}: AddUrlDialogProps) {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [meta, setMeta] = useState<{title?: string; channelName?: string} | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setUrl('');
    setStep('idle');
    setErrorMsg('');
    setMeta(null);
  }, []);

  const handleClose = useCallback((o: boolean) => {
    if (!o) {
      abortRef.current?.abort();
      if (step === 'done') onComplete();
      reset();
    }
    onOpenChange(o);
  }, [step, onComplete, onOpenChange, reset]);

  const handleSubmit = async () => {
    if (!url.trim()) return;
    setStep('meta');
    setErrorMsg('');
    setMeta(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/video/add-url', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({url: url.trim()}),
        signal: controller.signal,
      });

      // Non-SSE error (JSON response)
      if (!res.ok || !res.body) {
        let message = '요약에 실패했습니다';
        try {
          const data = await res.json();
          message = data.error || message;
        } catch { /* */ }
        setStep('error');
        setErrorMsg(message);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split('\n');
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            if (currentEvent === 'done') {
              setStep('done');
            } else if (currentEvent === 'error') {
              setStep('error');
              try {
                const data = JSON.parse(line.slice(6));
                if (data.message) setErrorMsg(data.message);
              } catch { /* */ }
            } else {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.step === 'meta_done') {
                  setMeta({title: data.title, channelName: data.channelName});
                  setStep('transcript');
                } else if (data.step === 'transcript') {
                  setStep('transcript');
                } else if (data.step === 'summarize') {
                  setStep('summarize');
                } else if (data.message && !data.step) {
                  setStep('error');
                  setErrorMsg(data.message);
                }
              } catch { /* */ }
            }
          } else if (line.trim() === '') {
            // Empty line resets event type per SSE spec
            currentEvent = '';
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setStep('error');
      setErrorMsg(e instanceof Error ? e.message : '알 수 없는 오류');
    }
  };

  const isProcessing = step !== 'idle' && step !== 'done' && step !== 'error';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md !max-h-fit !inset-y-auto !top-1/2 !-translate-y-1/2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            YouTube URL 추가
          </DialogTitle>
          <DialogDescription>YouTube 영상 URL을 입력하면 자동으로 요약합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* URL Input */}
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isProcessing && url.trim()) handleSubmit();
              }}
              placeholder="https://youtube.com/watch?v=..."
              disabled={isProcessing || step === 'done'}
              aria-label="YouTube URL"
              className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:opacity-50"
            />
            <Button
              onClick={handleSubmit}
              disabled={!url.trim() || isProcessing || step === 'done'}
              size="sm"
              className="h-10 px-4 shrink-0"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                '요약'
              )}
            </Button>
          </div>

          {/* Progress */}
          {step !== 'idle' && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3" aria-live="polite" {...(step === 'error' ? {role: 'alert'} : {})}>
              {/* Meta info */}
              {meta && (
                <div className="text-sm">
                  <p className="font-medium truncate">{meta.title}</p>
                  <p className="text-xs text-muted-foreground">{meta.channelName}</p>
                </div>
              )}

              {/* Step indicator */}
              <div className="flex items-center gap-2">
                {step === 'done' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-hidden="true" />
                ) : step === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" aria-hidden="true" />
                )}
                <span className="text-sm text-muted-foreground">
                  {step === 'error' ? errorMsg : STEP_LABELS[step]}
                </span>
              </div>

              {/* Progress bar */}
              {isProcessing && (
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    role="progressbar"
                    aria-valuenow={step === 'meta' ? 20 : step === 'transcript' ? 50 : step === 'summarize' ? 80 : 100}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{
                      width: step === 'meta' ? '20%' : step === 'transcript' ? '50%' : step === 'summarize' ? '80%' : '100%',
                    }}
                  />
                </div>
              )}

              {/* Done / Error actions */}
              {step === 'done' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleClose(false)}
                  className="w-full"
                >
                  확인
                </Button>
              )}
              {step === 'error' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={reset}
                  className="w-full"
                >
                  다시 시도
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
