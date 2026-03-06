'use client';

import {PlayerProvider} from '@/components/features/podcast/player-context';
import {MiniPlayer} from '@/components/features/podcast/mini-player';
import {PullToRefresh} from '@/components/layout/pull-to-refresh';

interface LayoutShellProps {
  children: React.ReactNode;
}

/**
 * LayoutShell — client boundary for the authenticated layout.
 *
 * This component is intentionally 'use client' and owns:
 * - PlayerProvider: global audio context (episode state, playback controls)
 * - MiniPlayer: the persistent fixed-position bottom player bar
 * - PullToRefresh: custom pull-to-refresh for Safari PWA
 *
 * Why a dedicated component instead of marking layout.tsx as 'use client'?
 * Next.js App Router allows server components to pass RSC children into a
 * client component as an opaque React prop. The children are serialized as
 * RSC payload and streamed separately — they are NOT bundled into the client
 * JS graph and do NOT get hydrated just because their parent is a client
 * component. This keeps dashboard, calendar, memo, and curation pages as
 * true server components with minimal client-side JavaScript.
 *
 * PlayerProvider must wrap both children AND MiniPlayer because:
 * - MiniPlayer calls usePlayer() to display current episode / control playback
 * - EpisodeCard components (inside the podcast page, passed via children)
 *   also call usePlayer() to trigger play/pause on individual episodes
 * Both must receive the same context instance from a single provider.
 */
export function LayoutShell({ children }: LayoutShellProps) {
  return (
    <PlayerProvider>
      <PullToRefresh>
        {children}
      </PullToRefresh>
      <MiniPlayer />
    </PlayerProvider>
  );
}
