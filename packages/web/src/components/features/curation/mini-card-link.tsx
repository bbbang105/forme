'use client';

import {type ReactNode, useCallback} from 'react';

interface MiniCardLinkProps {
  itemId: string;
  href: string;
  className?: string;
  children: ReactNode;
}

/**
 * Curation MiniCard 링크 래퍼.
 * 클릭 시 외부 URL을 열고, 동시에 PATCH로 읽음 처리(readAt 포함).
 */
export function MiniCardLink({itemId, href, className, children}: MiniCardLinkProps) {
  const handleClick = useCallback(
    () => {
      // 읽음 처리 (fire-and-forget, 링크 열기를 블로킹하지 않음)
      fetch(`/api/curation/${itemId}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({isRead: true}),
      }).catch(() => {});
    },
    [itemId],
  );

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
