'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Newspaper, Calendar, StickyNote, Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/dashboard', label: '홈', icon: Home },
  { href: '/curation', label: '큐레이션', icon: Newspaper },
  { href: '/calendar', label: '캘린더', icon: Calendar },
  { href: '/memo', label: '메모', icon: StickyNote },
  { href: '/podcast', label: '팟캐스트', icon: Headphones },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 min-w-[64px] py-1.5 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
