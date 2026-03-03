import { Headphones } from 'lucide-react';

export default function PodcastPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <Headphones className="h-6 w-6 text-primary" />
      </div>
      <h2 className="text-lg font-semibold mb-1">팟캐스트</h2>
      <p className="text-sm text-muted-foreground">
        AI 팟캐스트 플레이어 기능이 곧 추가됩니다
      </p>
    </div>
  );
}
