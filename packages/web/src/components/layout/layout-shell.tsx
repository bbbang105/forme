'use client';

import {useEffect, useState} from 'react';
import {PullToRefresh} from '@/components/layout/pull-to-refresh';
import {Sidebar} from '@/components/layout/sidebar';
import {cn} from '@/lib/utils';

const STORAGE_KEY = 'forme-sidebar-collapsed';
const AUTO_COLLAPSE_BREAKPOINT = 1280;

interface LayoutShellProps {
  children: React.ReactNode;
}

/**
 * LayoutShell — client boundary for the authenticated layout.
 * Owns:
 *  - PullToRefresh (Safari PWA support, mobile-only)
 *  - Desktop Sidebar visibility + collapsed state (lg:, persisted in localStorage)
 *  - Main content left-margin offset to clear the fixed sidebar
 *
 * Mobile (< lg): sidebar is hidden, TabBar (also a client boundary) handles
 * primary navigation.
 */
export function LayoutShell({ children }: LayoutShellProps) {
  // SSR-safe default: expanded. Hydrate the saved value client-side.
  // We deliberately read localStorage inside useEffect (not a lazy initializer)
  // to avoid hydration mismatches between server and client markup, and gate
  // the `lg:ml-*` offset on `hydrated` so the first paint doesn't flash the
  // wrong width.
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const next =
      stored !== null ? stored === 'true' : window.innerWidth < AUTO_COLLAPSE_BREAKPOINT;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from localStorage is the intended effect purpose here
    setCollapsed(next);
    setHydrated(true);
  }, []);

  const handleToggle = (value: boolean) => {
    setCollapsed(value);
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // Storage may be unavailable (private mode) — state still works for session.
    }
  };

  return (
    <>
      <Sidebar collapsed={collapsed} onToggleCollapsed={handleToggle} />
      <PullToRefresh>
        <main
          className={cn(
            'pt-[calc(3.5rem+env(safe-area-inset-top))]',
            // Mobile keeps the TabBar spacer; desktop drops it since TabBar is `lg:hidden`.
            'pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0',
            // Offset for the fixed desktop sidebar. Avoid flashing the wrong width
            // on first paint: keep the `ml` neutral until hydration resolves the
            // saved collapsed state.
            'transition-[margin-left] duration-200 ease-in-out',
            // Default to `lg:ml-52` so the first paint already clears the
            // expanded sidebar width. After hydration, only narrow to `lg:ml-16`
            // when the saved state is collapsed — avoids an overlap flash while
            // localStorage is being read.
            hydrated && collapsed ? 'lg:ml-16' : 'lg:ml-52',
          )}
        >
          {children}
        </main>
      </PullToRefresh>
    </>
  );
}
