'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Calendar, Newspaper, PanelLeftClose, PanelLeftOpen, PlayCircle, StickyNote} from 'lucide-react';
import {cn} from '@/lib/utils';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: (value: boolean) => void;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

const navItems: NavItem[] = [
  { title: 'Feed', href: '/feed', icon: Newspaper },
  { title: 'YouTube', href: '/youtube', icon: PlayCircle },
  { title: 'Calendar', href: '/calendar', icon: Calendar },
  { title: 'Notes', href: '/notes', icon: StickyNote },
];

// ── NavLink ────────────────────────────────────────────────────────────────
function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      aria-label={item.title}
      title={collapsed ? item.title : undefined}
      className={cn(
        'group relative flex items-center rounded-sm',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        collapsed ? 'justify-center h-10 w-10 mx-auto' : 'gap-3 px-3 py-2.5',
        isActive
          ? 'text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
      )}
    >
      {/* Active left accent bar — ember hairline, forme editorial mark */}
      {isActive && !collapsed && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-primary rounded-full"
        />
      )}
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors duration-150',
          isActive
            ? 'text-primary'
            : 'text-muted-foreground/70 group-hover:text-foreground',
        )}
        aria-hidden
      />
      {!collapsed && (
        <span
          className={cn(
            'truncate font-mono text-[11px] uppercase tracking-[0.14em] leading-none',
            isActive ? 'font-semibold' : 'font-medium',
          )}
        >
          {item.title}
        </span>
      )}
    </Link>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────
/**
 * Desktop-only editorial sidebar (`lg:` 1024+). Sits below the fixed Header,
 * takes over primary navigation — pairs with `TabBar` (mobile only) via
 * `lg:hidden` toggle on the tab bar.
 *
 * Collapsible (240px ↔ 64px) with localStorage persistence in the parent.
 */
export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const pathname = usePathname();

  const toggle = () => onToggleCollapsed(!collapsed);

  return (
    <aside
      aria-label="주 내비게이션"
      className={cn(
        // Align top with the Header's actual footprint (h-14 + notch/Dynamic Island safe area).
        'fixed left-0 top-[calc(3.5rem+env(safe-area-inset-top))] bottom-0 z-30',
        'hidden lg:flex lg:flex-col',
        'border-r border-border/60 dark:border-border',
        'bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/75',
        'transition-[width] duration-200 ease-in-out',
        collapsed ? 'w-16' : 'w-52',
      )}
    >
      {/* ── Primary nav ────────────────────────────────────────────── */}
      <nav
        aria-label="주 메뉴"
        className={cn('flex-1 overflow-y-auto pt-5 pb-3', collapsed ? 'px-2' : 'px-3')}
      >
        {!collapsed && (
          <div className="px-2 pb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="text-primary" aria-hidden="true">—</span> Menu
          </div>
        )}
        <ul role="list" className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <NavLink item={item} isActive={isActive} collapsed={collapsed} />
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Collapse toggle ────────────────────────────────────────── */}
      <div
        className={cn(
          'shrink-0 border-t border-border/60 pb-3 pt-3',
          collapsed ? 'px-2' : 'px-3',
        )}
      >
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-expanded={!collapsed}
          className={cn(
            'flex w-full items-center rounded-sm',
            'text-muted-foreground/70 hover:text-foreground hover:bg-muted/60',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            collapsed ? 'justify-center h-10' : 'gap-3 px-3 py-2',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] leading-none">
                Collapse
              </span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
