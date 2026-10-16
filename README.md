# VAQ 센트럴

제주 학교 급식실(조리실) 공기질 중앙관제 대시보드. 프로젝트 배경·범위·제약은 [CLAUDE.md](CLAUDE.md) 참고.

## 현재 상태 — Phase 1 (개념 데모)

목업 데이터로 지도 기반 대시보드 한 화면을 구현한 단계다. 실 데이터·서버·로그인은 아직 없다.

- 데이터: `src/lib/mock.ts`의 가상 13개교. **실측값이 아니다** — 화면 상단에 상시 표시된다.
- 지도: 외부 지도 API를 쓰지 않고 제주 행정구역 GeoJSON을 SVG로 직접 그린다(`src/components/JejuMap.tsx`). 인터넷 없이 동작한다.
- 갱신: 5초 간격으로 새 측정값 세트를 생성한다(CLAUDE.md 1. 개요).

## 로컬 실행

```bash
npm install
npm run dev
```

http://localhost:3000

## 구조

| 경로 | 역할 |
| --- | --- |
| `src/app/page.tsx` | 대시보드 화면. 5초 tick과 선택 상태를 쥔다 |
| `src/components/Sidebar.tsx` | 좌측 네비게이션(1차 범위상 '관제 지도'만 동작) |
| `src/components/SchoolList.tsx` | 학교 목록 · 검색 · 상태 필터 |
| `src/components/JejuMap.tsx` | 제주 벡터맵과 상태 마커 |
| `src/components/DetailPanel.tsx` | 선택한 학교의 구역별 측정값 |
| `src/lib/types.ts` | 도메인 타입 |
| `src/lib/thresholds.ts` | 정상/주의/경고 판정 임계값 |
| `src/lib/mock.ts` | 목업 데이터 생성 |
| `src/data/jeju-geo.json` | 제주시·서귀포시 경계(통계청 2013, 단순화) |

## 실 데이터로 바꿀 때

- 학교 명단·좌표: `src/lib/mock.ts`의 `SITES` 교체.
- 판정 기준: `src/lib/thresholds.ts`의 `THRESHOLDS` 교체. 현재 값은 **가정치**다.
- 측정 항목(`src/lib/types.ts`의 `Reading`)은 확정됐다 — 초미세먼지·미세먼지·이산화탄소·일산화탄소·포름알데히드·온도·습도·VOC 8종. 이 중 온도·습도는 판정에 쓰지 않고 값만 표시한다.

## 아직 없는 것

- 로그인(Supabase Auth), 서버/DB, 실 데이터 수집
- 조리실 도면 위 센서 위치 표시 — 교육청 요구사항(CLAUDE.md 4.)
- 실외 대기질·기상 연동, AI 이상징후 멘트, AI 보고서 (CLAUDE.md 6. 향후 검토)

## 출처

지도 경계 데이터: [southkorea/southkorea-maps](https://github.com/southkorea/southkorea-maps) (통계청 2013 행정구역), 제주시·서귀포시만 추출해 Douglas-Peucker로 단순화(2,323점).
