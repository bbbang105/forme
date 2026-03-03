'use client';

import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const pageTitles: Record<string, string> = {
  '/dashboard': 'forme',
  '/curation': '큐레이션',
  '/calendar': '캘린더',
  '/memo': '메모',
  '/podcast': '팟캐스트',
};

export function Header() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  const title = pageTitles[pathname] || 'forme';
  const isHome = pathname === '/dashboard';

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'border-b border-border/60 dark:border-border',
        'bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/75',
        'pt-[env(safe-area-inset-top)]'
      )}
    >
      <div className="flex items-center justify-between h-14 px-4 max-w-lg mx-auto">
        <h1
          className={cn(
            'text-lg tracking-tight',
            isHome ? 'font-black' : 'font-semibold'
          )}
        >
          {title}
        </h1>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 active:scale-90 transition-all duration-150"
          aria-label={resolvedTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">테마 전환</span>
        </Button>
      </div>
    </header>
  );
}
