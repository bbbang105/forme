'use client';

import {useState} from 'react';
import Image from 'next/image';
import {cn} from '@/lib/utils';

interface MiniCardThumbnailProps {
  src: string | null;
  gradient: string;
}

/**
 * MiniCardThumbnail — minimal client island for the dashboard curation widget.
 *
 * 외부 RSS 이미지 URL은 hostname이 무한히 다양하므로 unoptimized 사용.
 * onError 폴백으로 깨진 이미지 → 그라데이션 플레이스홀더 전환.
 */
export function MiniCardThumbnail({ src, gradient }: MiniCardThumbnailProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (src && !imgFailed) {
    return (
      <Image
        src={src}
        alt=""
        width={64}
        height={48}
        unoptimized
        className="w-full h-full object-cover"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className={cn(
        'w-full h-full bg-gradient-to-br flex items-center justify-center',
        gradient,
      )}
    >
      <span className="text-sm select-none opacity-60" aria-hidden="true">
        📄
      </span>
    </div>
  );
}
