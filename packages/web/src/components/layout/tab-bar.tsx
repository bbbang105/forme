'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Calendar, Newspaper, PlayCircle, StickyNote} from 'lucide-react';
import {cn} from '@/lib/utils';

const tabs = [
  { href: '/feed', label: 'Feed', icon: Newspaper },
  { href: '/youtube', label: 'YouTube', icon: PlayCircle },
  { href: '/calendar', label: 'Calendar', icon: Calendar },
  { href: '/notes', label: 'Notes', icon: StickyNote },
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
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 flex-1 h-full',
                'transition-colors duration-150',
                'active:scale-[0.96]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-7 rounded-full bg-primary"
                />
              )}
              <Icon
                className="h-5 w-5 transition-transform duration-150"
                strokeWidth={isActive ? 2.25 : 1.75}
              />
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
