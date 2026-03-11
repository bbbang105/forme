'use client';

import {useCallback, useState} from 'react';
import {Plus} from 'lucide-react';
import {Button} from '@/components/ui/button';
import dynamic from 'next/dynamic';
import {EpisodeList} from '@/components/features/podcast/episode-list';
import type {Episode} from '@/components/features/podcast/player-context';

const UploadDialog = dynamic(
  () => import('@/components/features/podcast/upload-dialog').then((m) => m.UploadDialog),
  {
    ssr: false,
    loading: () => null,
  }
);

export default function PodcastPage() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lastEpisode, setLastEpisode] = useState<Episode | null>(null);

  const handleUploadSuccess = useCallback((episode: Episode) => {
    setLastEpisode(episode);
    setUploadOpen(false);
  }, []);

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">팟캐스트</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            AI 팟캐스트 에피소드를 업로드하고 들어보세요
          </p>
        </div>
        <Button
          onClick={() => setUploadOpen(true)}
          size="sm"
          className="rounded-full h-9 px-4 gap-1.5 shadow-sm active:scale-95 transition-transform"
        >
          <Plus className="h-4 w-4" />
          업로드
        </Button>
      </div>

      {/* Episode List */}
      <EpisodeList newEpisode={lastEpisode} />

      {/* Upload Dialog */}
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}
