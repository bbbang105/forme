import {TabBar} from '@/components/layout/tab-bar';
import {Header} from '@/components/layout/header';
import {ScrollToTop} from '@/components/layout/scroll-to-top';
import {LayoutShell} from '@/components/layout/layout-shell';

/**
 * MainLayout — authenticated route group layout (server component).
 *
 * Architecture:
 * - This file itself is a server component (no 'use client' directive).
 * - LayoutShell is a 'use client' component that owns PlayerProvider and
 *   MiniPlayer. It acts as the client boundary for audio playback state.
 * - {children} are passed as a React prop (RSC slot) into LayoutShell.
 *   Next.js serializes them as RSC payload — they are NOT pulled into the
 *   client JS bundle just because they render inside a client provider.
 *   This prevents unnecessary client hydration of dashboard, memo,
 *   calendar, and curation server component pages.
 * - Header, TabBar, ScrollToTop each form their own isolated client
 *   boundaries via their own 'use client' declarations.
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <LayoutShell>
        <main className="pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(4rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
      </LayoutShell>
      <TabBar />
      <ScrollToTop />
    </div>
  );
}
