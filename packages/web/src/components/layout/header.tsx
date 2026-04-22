'use client';

import Image from 'next/image';
import Link from 'next/link';
import {useTheme} from 'next-themes';
import {Moon, Sun, User} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Wordmark} from '@/components/ui/logo';
import {cn} from '@/lib/utils';

interface HeaderProps {
  avatarUrl?: string | null;
}

export function Header({ avatarUrl }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header
      className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'border-b border-border/60 dark:border-border',
        'bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/75',
        'pt-[env(safe-area-inset-top)]'
      )}
    >
      {/* Full-width chrome so the forme wordmark sits on the same x-axis as the
          collapsed Sidebar icons (w-16 → icon center ≈ 32px matches `lg:px-8`). */}
      <div className="flex items-center justify-between h-14 px-4 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          aria-label="대시보드로 이동"
          className="inline-flex items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Wordmark size={26} />
        </Link>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 active:scale-90 transition-all duration-150 relative"
            aria-label="테마 전환"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            suppressHydrationWarning
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          <Link
            href="/profile"
            className="h-9 w-9 rounded-full overflow-hidden flex items-center justify-center hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="프로필"
          >
            {avatarUrl ? (
              <Image src={avatarUrl} alt="" width={36} height={36} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
