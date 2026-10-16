/**
 * 실외 대기질·기상 — 4권역 (CLAUDE.md 5절).
 *
 * 기상청 제주 예보구역과 같은 이름으로 나눈다: 북부(제주)·남부(서귀포)·동부(성산)·서부(고산).
 * 다만 실제 예보구역 경계는 읍면동 행정구역 기반인데, 여기서는 한라산을 중심으로 한
 * 방위각 4분할로 **근사**했다. 원형에 가까운 섬이라 대체로 맞지만 경계가 정확하지는 않다.
 * 실 데이터를 붙일 때는 읍면동 → 예보구역 매핑표로 교체해야 한다.
 *
 * 목업 데이터다. 실측값이 아니다.
 */

export type RegionId = 'north' | 'east' | 'south' | 'west';

/** 한라산 백록담 — 방위각 기준점. */
export const CENTER = { lat: 33.3617, lng: 126.5292 };

/** 위도 보정 계수. 좁은 범위라 이 정도 근사로 충분하다. */
const KX = Math.cos((CENTER.lat * Math.PI) / 180);

export interface Region {
  id: RegionId;
  name: string;
  /** 대표 지역명 — 기상청 예보구역의 관측 기준점. */
  station: string;
  /** 북쪽 0도, 시계방향. [시작, 끝) */
  from: number;
  to: number;
  /** 칩을 띄울 위치. 학교 마커와 겹치지 않는 지점으로 골랐다. */
  chip: { lat: number; lng: number };
}

export const REGIONS: Region[] = [
  { id: 'north', name: '북부', station: '제주', from: -45, to: 45, chip: { lat: 33.52, lng: 126.72 } },
  { id: 'east', name: '동부', station: '성산', from: 45, to: 135, chip: { lat: 33.33, lng: 126.90 } },
  { id: 'south', name: '남부', station: '서귀포', from: 135, to: 225, chip: { lat: 33.21, lng: 126.66 } },
  { id: 'west', name: '서부', station: '고산', from: 225, to: 315, chip: { lat: 33.35, lng: 126.21 } },
];

/** 한라산 기준 방위각(북 0도, 시계방향, -180~180). */
export function bearingFrom(lat: number, lng: number): number {
  const dy = lat - CENTER.lat;
  const dx = (lng - CENTER.lng) * KX;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

export function regionOf(lat: number, lng: number): RegionId {
  const b = bearingFrom(lat, lng);
  if (b >= -45 && b < 45) return 'north';
  if (b >= 45 && b < 135) return 'east';
  if (b >= -135 && b < -45) return 'west';
  return 'south';
}

export interface OutdoorReading {
  pm10: number;
  pm25: number;
  temp: number;
  humidity: number;
}

/** 환경부 4단계 등급. */
export type Grade = '좋음' | '보통' | '나쁨' | '매우나쁨';

const PM10_BANDS: Array<[number, Grade]> = [[30, '좋음'], [80, '보통'], [150, '나쁨']];
const PM25_BANDS: Array<[number, Grade]> = [[15, '좋음'], [35, '보통'], [75, '나쁨']];

function grade(bands: Array<[number, Grade]>, v: number): Grade {
  for (const [max, g] of bands) if (v <= max) return g;
  return '매우나쁨';
}

export const pm10Grade = (v: number) => grade(PM10_BANDS, v);
export const pm25Grade = (v: number) => grade(PM25_BANDS, v);

/**
 * 실외 등급 색. **실내 상태(초록/노랑/빨강)와 절대 겹치면 안 된다.**
 * 지도에서 같은 색이 두 가지를 뜻하면 읽을 수 없으므로 파랑→보라 계열로 분리한다.
 */
export const GRADE_COLOR: Record<Grade, string> = {
  좋음: '#3B82F6',
  보통: '#6366F1',
  나쁨: '#A855F7',
  매우나쁨: '#D946EF',
};

/** 배경 틴트 농도 — 나쁠수록 진하다. 학교 마커를 가리지 않을 만큼만. */
export const GRADE_OPACITY: Record<Grade, number> = {
  좋음: 0.06,
  보통: 0.11,
  나쁨: 0.18,
  매우나쁨: 0.26,
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 권역별 기저 오염도. 서쪽이 대륙 유입 영향을 더 받는다고 가정했다(목업).
 * 네 권역이 모두 같은 등급으로 나오면 4분할한 의미가 화면에 안 드러나므로,
 * 등급이 갈리도록(좋음/보통/보통/나쁨) 값을 벌려 뒀다.
 */
const BASE: Record<RegionId, number> = { north: 1.0, east: 1.35, south: 0.4, west: 2.0 };

/** 실외 데이터는 1시간 단위라 5초 tick마다 바뀌지 않는다. 12틱(=1분)마다 갱신되게 뒀다. */
export function buildOutdoor(tick: number): Record<RegionId, OutdoorReading> {
  const slot = Math.floor(tick / 12);
  const out = {} as Record<RegionId, OutdoorReading>;
  for (const r of REGIONS) {
    const rnd = mulberry32(slot * 6151 + r.id.charCodeAt(0) * 131);
    const load = BASE[r.id];
    const j = (s: number) => (rnd() - 0.5) * s;
    out[r.id] = {
      pm10: Math.max(5, Math.round(52 * load + j(18))),
      pm25: Math.max(2, Math.round(24 * load + j(9))),
      temp: +(24.5 + j(5)).toFixed(1),
      humidity: Math.round(68 + j(18)),
    };
  }
  return out;
}
