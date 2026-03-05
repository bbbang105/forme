# 모바일 PWA 성능 최적화

> 2026-03-05 | 배포 후 5배 느림 문제 분석 및 해결

## 근본 원인

**Vercel 리전 미설정** → 기본값 `iad1`(미국 동부)에 배포, DB는 `ap-northeast-2`(서울).
모든 Supabase auth/DB 호출이 미국↔서울 왕복 (180-250ms/회).
대시보드 로드 시 8+회 왕복 → 순수 네트워크 지연만 2-3초.

## 적용된 최적화

### P0 - 인프라 (가장 큰 체감 개선)

| 변경 | 파일 | 효과 |
|------|------|------|
| Vercel 리전 `icn1` (서울) 설정 | `vercel.json` | DB 왕복 180ms → ~5ms |
| DB 커넥션 풀 `max: 10` → `max: 1` | `packages/shared/src/db.ts` | 서버리스 커넥션 고갈 방지 |
| `serverExternalPackages` 추가 | `next.config.ts` | @aws-sdk, web-push 번들 제외 |
| 이미지 AVIF 포맷 + 24h 캐시 | `next.config.ts` | 이미지 최적화 |

### P1 - 중복 Auth 제거

| 변경 | 파일 | 효과 |
|------|------|------|
| `createClient()` → `getAuthUser()` | `dashboard/page.tsx` | React.cache 활용, 중복 auth 제거 |
| `createClient()` → `getAuthUser()` | `dashboard-curation.tsx` | 동일 |

### P1 - 데이터 페칭 워터폴 해소

| 변경 | 파일 | 효과 |
|------|------|------|
| 순차 쿼리 → `Promise.all` | `dashboard-calendar.tsx` | todos + events 병렬 실행 |

### P1 - 렌더링 최적화

| 변경 | 파일 | 효과 |
|------|------|------|
| PlayerProvider 컨텍스트 분리 | `player-context.tsx` | 4Hz 전체 리렌더 → 시간 컨텍스트만 |
| `usePlayerTime()` 훅 분리 | `mini-player.tsx`, `audio-player.tsx`, `episode-card.tsx` | 필요한 컴포넌트만 시간 업데이트 |
| `handleSelectDate` useCallback | `calendar-client.tsx` | WeekRow React.memo 정상 작동 |
| CurationCard/ListRow React.memo | `curation-card.tsx` | 불필요한 카드 리렌더 방지 |

### P1 - 번들 최적화

| 변경 | 파일 | 효과 |
|------|------|------|
| lowlight 170+언어 → 12언어 | `memo-editor.tsx` | ~400KB → ~40KB (TipTap 청크) |
| 언어 드롭다운 축소 | `code-block-view.tsx` | 등록된 언어만 표시 |
| EventForm/CategoryManager 지연 로딩 | `calendar-client.tsx` | 캘린더 초기 JS 감소 |

### P1 - 폰트 로딩

| 변경 | 파일 | 효과 |
|------|------|------|
| 중복 dns-prefetch 제거 | `layout.tsx` | 불필요한 힌트 제거 |

### P2 - API 최적화

| 변경 | 파일 | 효과 |
|------|------|------|
| Reorder N순차 → Promise.all 병렬 | `sources/reorder/route.ts` | 50개 기준 10초 → ~5ms |

## 예상 효과

- **배포 환경 TTFB**: ~2-3초 → ~200ms (리전 수정만으로 10배+ 개선)
- **대시보드 로드**: auth 3회→1회, 쿼리 병렬화로 추가 ~200ms 절감
- **오디오 재생 중 UI**: 전체 4Hz 리렌더 제거
- **TipTap 번들**: ~360KB 절감
- **Reorder API**: 최대 10초 → ~5ms
