import type { Reading, Status } from './types';

/**
 * 상태 판정 임계값.
 *
 * 미확인 — 실제 VAQ 판정 기준을 받으면 이 파일만 교체하면 된다.
 * 현재 값은 학교보건법·실내공기질관리법 기준을 조리흄이 상시 발생하는
 * 조리실 환경에 맞춰 완화한 목업용 가정치다.
 *
 * 온도·습도는 판정에 쓰지 않고 표시만 한다.
 */
export const THRESHOLDS = {
  pm25: { warning: 50, critical: 100 }, // 학교 기준 35
  pm10: { warning: 100, critical: 200 }, // 학교 기준 75
  co2: { warning: 1000, critical: 2000 }, // 학교 기준 1000ppm
  co: { warning: 10, critical: 25 }, // 학교 기준 10ppm
  hcho: { warning: 80, critical: 120 }, // 학교 기준 80㎍/㎥
  voc: { warning: 500, critical: 1000 }, // 다중이용시설 권고 500㎍/㎥
} as const;

export type JudgedMetric = keyof typeof THRESHOLDS;

export function metricStatus(metric: JudgedMetric, value: number): Status {
  const t = THRESHOLDS[metric];
  if (value >= t.critical) return 'critical';
  if (value >= t.warning) return 'warning';
  return 'normal';
}

const RANK: Record<Status, number> = { normal: 0, warning: 1, critical: 2 };

export function worst(statuses: Status[]): Status {
  return statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'normal' as Status);
}

export function readingStatus(r: Reading): Status {
  const keys = Object.keys(THRESHOLDS) as JudgedMetric[];
  return worst(keys.map((k) => metricStatus(k, r[k])));
}

export const STATUS_LABEL: Record<Status, string> = {
  normal: '정상',
  warning: '주의',
  critical: '경고',
};

/**
 * 상태 3색. 검증기(dataviz)로 확인한 값이다 — 눈대중으로 바꾸지 말 것.
 * 기존 앰버(#F5A623)는 적색약에서 초록과 ΔE 4.5로 사실상 구분이 안 됐다.
 * 밝은 노랑으로 옮겨 ΔE 13.4 확보. 브랜드 액센트(#2DE1E1)와도 ΔE 23.8로 떨어져 있다.
 * 지도 마커는 색 외에 모양(원/삼각/사각)으로도 구분한다.
 */
export const STATUS_COLOR: Record<Status, string> = {
  normal: '#22C55E',
  warning: '#FDE047',
  critical: '#EF4444',
};
