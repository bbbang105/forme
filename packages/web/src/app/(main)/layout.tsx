import {TabBar} from '@/components/layout/tab-bar';
import {Header} from '@/components/layout/header';
import {ScrollToTop} from '@/components/layout/scroll-to-top';
import {LayoutShell} from '@/components/layout/layout-shell';
import {getAuthUser} from '@/lib/auth';
import {db, profiles} from '@forme/shared';
import {eq} from 'drizzle-orm';

/**
 * MainLayout — authenticated route group layout (server component).
 *
 * Architecture:
 * - This file itself is a server component (no 'use client' directive).
 * - Avatar URL is fetched server-side here and passed as a prop to Header,
 *   eliminating the client-side fetch waterfall that previously caused a
 *   hydration mismatch (null avatar flash on first render).
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
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch avatar server-side to avoid client waterfall + hydration flash.
  // getAuthUser() is React.cache-memoized so this is free if dashboard page
  // also calls it in the same render pass.
  let avatarUrl: string | null = null;
  try {
    const user = await getAuthUser();
    const [profile] = await db
      .select({ avatarUrl: profiles.avatarUrl })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);
    avatarUrl = profile?.avatarUrl ?? null;

    // Fallback: derive from Discord identity if profile row not yet created
    if (!avatarUrl) {
      const identity = user.identities?.find((i) => i.provider === 'discord');
      avatarUrl = (identity?.identity_data?.avatar_url as string) ?? null;
    }
  } catch {
    // Unauthenticated or DB error — layout still renders, middleware handles redirect
  }

  return (
    <div className="min-h-screen bg-background">
      <Header avatarUrl={avatarUrl} />
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
