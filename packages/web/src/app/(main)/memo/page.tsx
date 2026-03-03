import { StickyNote } from 'lucide-react';

export default function MemoPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <StickyNote className="h-6 w-6 text-primary" />
      </div>
      <h2 className="text-lg font-semibold mb-1">메모</h2>
      <p className="text-sm text-muted-foreground">
        리치 텍스트 메모장 기능이 곧 추가됩니다
      </p>
    </div>
  );
}
