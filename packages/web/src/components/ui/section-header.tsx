import Link from 'next/link';
import {cn} from '@/lib/utils';

interface SectionHeaderProps {
  /** Mono uppercase eyebrow label — rendered with leading em-dash. */
  eyebrow: string;
  /** Display heading — Instrument Serif italic. Keep short. */
  title: string;
  /** Optional link-style action on the right (e.g., "View all"). */
  actionHref?: string;
  actionLabel?: string;
  className?: string;
}

/**
 * Editorial section header.
 * Eyebrow (mono/uppercase) + display serif title, with hairline underline.
 * Shared across dashboard widgets and feature screens.
 */
export function SectionHeader({
  eyebrow,
  title,
  actionHref,
  actionLabel,
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 border-b border-border pb-2',
        className
      )}
    >
      <div className="flex items-baseline gap-3 min-w-0">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground shrink-0">
          <span className="text-primary" aria-hidden="true">
            —
          </span>{' '}
          {eyebrow}
        </span>
        <h2 className="font-display text-xl leading-none text-foreground truncate">
          {title}
        </h2>
      </div>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:text-primary transition-colors shrink-0"
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}
