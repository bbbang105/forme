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
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'border-t border-border/60 dark:border-border',
        'bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/75',
        'pb-[max(env(safe-area-inset-bottom),0.5rem)]'
      )}
    >
      <div className="flex h-16 max-w-7xl mx-auto">
        {tabs.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full',
                'transition-all duration-150',
                'active:scale-[0.92] active:opacity-70',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="relative flex items-center justify-center w-8 h-8">
                <span
                  className={cn(
                    'absolute inset-0 rounded-full transition-all duration-200',
                    isActive
                      ? 'bg-primary/10 scale-100 opacity-100'
                      : 'bg-primary/10 scale-50 opacity-0'
                  )}
                />
                <Icon
                  className="relative z-10 h-5 w-5"
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </span>
              <span
                className={cn(
                  'text-[11px] leading-none tracking-tight',
                  isActive ? 'font-semibold' : 'font-medium'
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
