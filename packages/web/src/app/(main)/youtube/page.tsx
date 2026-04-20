'use client';

import dynamic from 'next/dynamic';
import {YoutubeFeedSkeleton} from '@/components/features/youtube/youtube-feed-skeleton';

const YoutubeFeed = dynamic(
  () => import('@/components/features/youtube/youtube-feed').then((m) => m.YoutubeFeed),
  { ssr: false, loading: () => <YoutubeFeedSkeleton /> },
);

export default function YoutubePage() {
  return <YoutubeFeed />;
}
