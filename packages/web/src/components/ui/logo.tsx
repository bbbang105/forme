import { useId } from 'react';

/**
 * 로고 마크 — 레트로 {f} 픽토그램
 * 중괄호 안의 f — "내 안의 모든 것"
 * square caps + scanline 텍스처로 레트로 개발자 감성
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  const uid = useId();
  const scanId = `lm-scan-${uid}`;

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
      <defs>
        <pattern id={scanId} width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="2" className="fill-primary" opacity="0.04" />
        </pattern>
      </defs>
      <rect width="32" height="32" rx="7" className="fill-zinc-900" />
      <rect width="32" height="32" rx="7" fill={`url(#${scanId})`} />
      {/* {f} — square caps for retro pixel feel */}
      <g className="stroke-primary" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" fill="none">
        <polyline points="9,8 7,8 7,14 5.5,16 7,18 7,24 9,24" />
        <line x1="16" y1="11" x2="16" y2="24" />
        <line x1="13" y1="16.5" x2="19.5" y2="16.5" />
        <polyline points="16,11 16,9.5 18.5,8" />
        <polyline points="23,8 25,8 25,14 26.5,16 25,18 25,24 23,24" />
      </g>
    </svg>
  );
}
