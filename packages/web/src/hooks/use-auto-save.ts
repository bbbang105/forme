import {useCallback, useEffect, useRef, useState} from 'react';

interface UseAutoSaveOptions {
  /** The async save function to call */
  saveFn: () => Promise<boolean>;
  /** Debounce delay in ms (default: 1000) */
  delay?: number;
  /** Duration to show "saved" indicator in ms (default: 1500) */
  savedDuration?: number;
}

interface UseAutoSaveReturn {
  saving: boolean;
  saved: boolean;
  saveError: boolean;
  /** Trigger a debounced save */
  scheduleSave: () => void;
  /** Immediately flush any pending save */
  flushSave: () => Promise<boolean>;
  /** Manually trigger save */
  save: () => Promise<boolean>;
  /** Ref to track IME composition state */
  composingRef: React.RefObject<boolean>;
  /** Detach all event listeners (call before navigation) */
  detach: () => void;
}

export function useAutoSave({
  saveFn,
  delay = 1000,
  savedDuration = 1500,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const composingRef = useRef(false);
  const blurHandlerRef = useRef<(() => void) | null>(null);

  // Keep saveFn in a ref to avoid re-registering event listeners on every saveFn change
  const saveFnRef = useRef(saveFn);
  useEffect(() => { saveFnRef.current = saveFn; }, [saveFn]);

  const save = useCallback(async (): Promise<boolean> => {
    // If a save is already in flight, wait for it instead of dropping changes
    if (savePromiseRef.current) return savePromiseRef.current;
    setSaving(true);
    setSaveError(false);
    const p = (async () => {
      try {
        const result = await saveFnRef.current();
        setSaved(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), savedDuration);
        return result;
      } catch {
        setSaveError(true);
        return false;
      } finally {
        savePromiseRef.current = null;
        setSaving(false);
      }
    })();
    savePromiseRef.current = p;
    return p;
  }, [savedDuration]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(), delay);
  }, [save, delay]);

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    return save();
  }, [save]);

  const detach = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (blurHandlerRef.current) {
      window.removeEventListener('blur', blurHandlerRef.current);
      blurHandlerRef.current = null;
    }
  }, []);

  // Flush pending save on blur / page hide / beforeunload
  useEffect(() => {
    const handleFlush = () => {
      // Do not flush during active IME composition (Korean input etc.)
      if (composingRef.current) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      save();
    };
    blurHandlerRef.current = handleFlush;
    const handleVisibilityChange = () => {
      if (document.hidden) handleFlush();
    };
    window.addEventListener('blur', handleFlush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleFlush);
    return () => {
      window.removeEventListener('blur', handleFlush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleFlush);
      blurHandlerRef.current = null;
    };
  }, [save]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return {
    saving,
    saved,
    saveError,
    scheduleSave,
    flushSave,
    save,
    composingRef,
    detach,
  };
}
