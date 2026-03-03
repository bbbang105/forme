import { TabBar } from '@/components/layout/tab-bar';
import { Header } from '@/components/layout/header';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pb-20 pt-14">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
