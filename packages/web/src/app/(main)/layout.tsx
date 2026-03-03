import {TabBar} from '@/components/layout/tab-bar';
import {Header} from '@/components/layout/header';
import {ScrollToTop} from '@/components/layout/scroll-to-top';
import {PlayerProvider} from '@/components/features/podcast/player-context';
import {MiniPlayer} from '@/components/features/podcast/mini-player';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PlayerProvider>
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(4rem+env(safe-area-inset-bottom))]">
          {children}
        </main>
        <MiniPlayer />
        <TabBar />
        <ScrollToTop />
      </div>
    </PlayerProvider>
  );
}
