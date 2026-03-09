'use client';

import {useEffect} from 'react';
import {Calendar} from 'lucide-react';
import {Button} from '@/components/ui/button';

export default function CalendarError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
        <Calendar className="h-6 w-6 text-destructive" />
      </div>
      <h2 className="text-lg font-semibold mb-1">캘린더를 불러올 수 없습니다</h2>
      <p className="text-sm text-muted-foreground mb-4">
        일시적인 오류가 발생했습니다
      </p>
      <Button onClick={reset} variant="outline" size="sm">
        다시 시도
      </Button>
    </div>
  );
}
