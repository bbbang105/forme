'use client';

import dynamic from 'next/dynamic';
import {VideoFeedSkeleton} from '@/components/features/video/video-feed-skeleton';

const VideoFeed = dynamic(
  () => import('@/components/features/video/video-feed').then((m) => m.VideoFeed),
  { ssr: false, loading: () => <VideoFeedSkeleton /> },
);

export default function VideoPage() {
  return <VideoFeed />;
}
