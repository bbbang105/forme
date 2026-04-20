'use client';

import {PullToRefresh} from '@/components/layout/pull-to-refresh';

interface LayoutShellProps {
  children: React.ReactNode;
}

/**
 * LayoutShell — client boundary for the authenticated layout.
 * Owns PullToRefresh for Safari PWA support.
 */
export function LayoutShell({ children }: LayoutShellProps) {
  return <PullToRefresh>{children}</PullToRefresh>;
}
