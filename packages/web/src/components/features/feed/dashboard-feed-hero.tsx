'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import {cn} from '@/lib/utils';
import {formatRelativeDate, getArticleGradient, getCategoryStyle} from '@/lib/feed-utils';
import {MiniCardLink} from './mini-card-link';
import {MiniCardThumbnail} from './mini-card-thumbnail';

const ROTATE_INTERVAL_MS = 6000;

export interface HeroItem {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  category: string;
  sourceName: string | null;
  description: string | null;
}

/**
 * FeedHeroRotator — 대시보드 최상단 헤드 기사 자동 로테이터.
 *
 * 6초마다 다음 기사로 fade 전환. 호버/포커스/탭 숨김 시 일시정지.
 * 진행바는 requestAnimationFrame으로 업데이트되며 paused 상태에서 누적된 elapsed를
 * 보존해 다시 활성화 시 남은 시간부터 이어간다.
 */
export function FeedHeroRotator({items}: {items: HeroItem[]}) {
  const [current, setCurrent] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const timeOnSlideRef = useRef(0);
  const paused = hoverPaused || tabHidden;

  // Pause when tab is hidden (background)
  useEffect(() => {
    const handler = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Rotation + progress driven by a single RAF loop.
  // Preserves elapsed across pause/resume by letting timeOnSlideRef accumulate
  // only while unpaused.
  useEffect(() => {
    if (paused || items.length <= 1) return;

    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const delta = now - lastTime;
      lastTime = now;
      timeOnSlideRef.current += delta;

      if (timeOnSlideRef.current >= ROTATE_INTERVAL_MS) {
        setCurrent((c) => (c + 1) % items.length);
        return;
      }

      if (progressRef.current) {
        const pct = Math.min(100, (timeOnSlideRef.current / ROTATE_INTERVAL_MS) * 100);
        progressRef.current.style.width = `${pct}%`;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [current, paused, items.length]);

  // Reset elapsed + progress bar on slide change.
  useEffect(() => {
    timeOnSlideRef.current = 0;
    if (progressRef.current) progressRef.current.style.width = '0%';
  }, [current]);

  const jumpTo = useCallback((i: number) => {
    setCurrent(i);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setHoverPaused(true)}
      onBlur={() => setHoverPaused(false)}
    >
      {/* Stacked slides — all in same grid cell, only active one visible */}
      <div className="grid">
        {items.map((item, i) => (
          <div
            key={item.id}
            className={cn(
              '[grid-area:1/1] transition-opacity duration-400',
              i === current ? 'opacity-100 visible' : 'opacity-0 invisible',
            )}
            aria-hidden={i !== current}
          >
            <HeroSlide item={item} interactive={i === current} />
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <div className="flex items-center gap-4 mt-6">
          <div className="flex gap-1.5" role="tablist" aria-label="Hero article">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                onClick={() => jumpTo(i)}
                aria-label={`${i + 1}번째 기사로 이동`}
                aria-selected={i === current}
                className={cn(
                  'w-6 h-0.5 rounded-full transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  i === current ? 'bg-primary' : 'bg-border hover:bg-muted-foreground',
                )}
              />
            ))}
          </div>
          <div className="flex-1 h-px bg-border overflow-hidden">
            <div ref={progressRef} className="h-full bg-primary" style={{width: '0%'}} />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground whitespace-nowrap">
            {current + 1} / {items.length}
          </span>
        </div>
      )}
    </div>
  );
}

function HeroSlide({item, interactive}: {item: HeroItem; interactive: boolean}) {
  const catStyle = getCategoryStyle(item.category);
  const relativeDate = formatRelativeDate(item.publishedAt);
  const gradient = getArticleGradient(item.title);

  return (
    <MiniCardLink
      itemId={item.id}
      href={item.url}
      className={cn(
        'group grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 lg:gap-10 items-start',
        !interactive && 'pointer-events-none',
      )}
    >
      <div className="aspect-[16/10] overflow-hidden rounded-sm bg-muted">
        <MiniCardThumbnail src={item.thumbnailUrl} gradient={gradient} />
      </div>
      <div className="space-y-4">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          <span
            className={cn(
              'inline-flex rounded-sm px-1.5 py-0.5 ring-1 ring-inset normal-case tracking-normal',
              catStyle.bg,
              catStyle.text,
              catStyle.ring,
            )}
          >
            {catStyle.label}
          </span>
          {item.sourceName && <span className="truncate">{item.sourceName}</span>}
          {relativeDate && (
            <>
              <span className="text-primary shrink-0" aria-hidden="true">
                ·
              </span>
              <span className="shrink-0">{relativeDate}</span>
            </>
          )}
        </div>
        <h3 className="font-display text-3xl lg:text-4xl leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-3">
          {item.title}
        </h3>
        {item.description && (
          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
            {item.description}
          </p>
        )}
      </div>
    </MiniCardLink>
  );
}
