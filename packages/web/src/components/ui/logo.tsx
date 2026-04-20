/**
 * Phase 3 forme 워드마크 / 마크
 * 베이스: Instrument Serif 이탤릭 + 번트 오렌지 마침표.
 * "for me" 개인성을 타이포 자체로 드러내고, 장식은 ember 마침표 하나로 끝.
 */

/**
 * LogoMark — compact `f.` 마크 (32x32 viewBox).
 * 헤더 아이콘/파비콘 용도. rounded cream card + italic serif f + ember period.
 */
export function LogoMark({size = 24}: {size?: number}) {
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
      <rect
        width="32"
        height="32"
        rx="7"
        className="fill-card stroke-border"
        strokeWidth="1"
      />
      <text
        x="7"
        y="25"
        className="fill-foreground font-display"
        style={{fontSize: 26}}
      >
        f<tspan className="fill-primary">.</tspan>
      </text>
    </svg>
  );
}

/**
 * Wordmark — 전체 `forme.` 워드마크.
 * 헤더 로고(텍스트형) / 히어로 / 푸터에 사용.
 */
export function Wordmark({size = 28}: {size?: number}) {
  return (
    <span
      className="font-display text-foreground inline-flex items-baseline leading-none"
      style={{fontSize: size}}
      aria-label="forme"
    >
      forme
      <span className="text-primary" aria-hidden="true">
        .
      </span>
    </span>
  );
}
