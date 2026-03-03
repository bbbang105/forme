'use client';

import {useEffect, useState} from 'react';
import {ArrowUp} from 'lucide-react';
import {cn} from '@/lib/utils';

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 300);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <button
      onClick={scrollToTop}
      aria-label="맨 위로"
      className={cn(
        'fixed right-4 z-40 lg:hidden',
        'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]',
        'h-10 w-10 rounded-full',
        'bg-foreground/60 text-background backdrop-blur-sm',
        'flex items-center justify-center',
        'shadow-lg transition-all duration-300',
        'active:scale-95',
        visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4 pointer-events-none'
      )}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
