import {cn} from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showMark?: boolean;
}

/**
 * forme 로고
 * - Mark: 둥근 사각형 + 라운드 스트로크 스타일의 'f' (두꺼운 선, 부드러운 곡선)
 * - Wordmark: "for" + "me" (포인트 컬러)
 */
export function Logo({ className, size = 'md', showMark = false }: LogoProps) {
  const sizes = {
    sm: { mark: 20, text: 'text-base', gap: 'gap-1.5' },
    md: { mark: 24, text: 'text-lg', gap: 'gap-2' },
    lg: { mark: 32, text: 'text-2xl', gap: 'gap-2.5' },
  };

  const s = sizes[size];

  return (
    <span className={cn('inline-flex items-center', s.gap, className)}>
      {showMark && <LogoMark size={s.mark} />}
      <span
        className={cn(
          s.text,
          'font-black tracking-tighter select-none',
        )}
      >
        for
        <span className="text-primary">me</span>
      </span>
    </span>
  );
}

/**
 * 로고 마크 — 둥근 사각형 안에 라운드 스트로크 'f'
 * 두꺼운 둥근 선으로 부드럽고 친근한 느낌
 * 상단 곡선이 자연스럽게 흐르고, 작은 악센트 점이 포인트
 */
function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      {/* 배경 — 약간 더 둥근 사각형 */}
      <rect width="32" height="32" rx="9" className="fill-primary" />

      {/* f — 두꺼운 라운드 스트로크 */}
      <g stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* 스템 + 상단 곡선: 아래에서 위로 올라가서 오른쪽으로 휘는 곡선 */}
        <path d="M14 25V14.5C14 10 16.5 7.5 20.5 7.5" />
        {/* 크로스바 */}
        <path d="M10.5 17H19" />
      </g>

      {/* 악센트 점 — 오른쪽 상단에 작은 원 (포인트, 개성) */}
      <circle cx="23" cy="8.5" r="2" fill="white" opacity="0.6" />
    </svg>
  );
}

export { LogoMark };
