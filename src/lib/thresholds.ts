import type { Reading, Status } from './types';

/**
 * 상태 판정 기준 — 조리실공기질기준표 (현장 탑재 정본).
 *
 * 출처: 조리실공기질기준표.xlsx (md5 9ecd3622d62f48833b3999c90626a1ea)
 *       학교 배포 시스템(school_vaq)의 plc_modbus_bridge/ 에 동봉된 파일과 동일함을 확인.
 * 근거: 2026-10-16 대표님 지시 — 학교 공기질모니터링시스템에 탑재되어 실제 관제 중인
 *       이 기준표에 맞출 것.
 *
 * 5단계 체계(매우좋음/좋음/보통/나쁨/매우나쁨)이며 매우나쁨은 점멸 지정이다.
 * 색상도 기준표의 RGB를 그대로 쓴다 — 눈대중으로 바꾸지 말 것.
 *
 * 단위(기준표 기준): PM2.5·PM10·HCHO = ㎍/㎥, CO2·CO = ppm, VOC = ppb.
 * 온도·습도는 기준표에 없다 — 판정하지 않고 값만 표시한다.
 */

/** 기준표 5단계. 값이 커질수록 나빠지는 오염형 지표 전용. */
export type Grade = 'veryGood' | 'good' | 'normal' | 'bad' | 'veryBad';

/** 각 단계가 시작되는 하한값(이 값 이상이면 해당 단계). */
interface GradeBands {
  good: number;
  normal: number;
  bad: number;
  veryBad: number;
}

/**
 * 기준표 원문 그대로.
 * 예: pm25.bad = 100 → 100 이상이면 '나쁨'(빨강).
 */
export const GRADE_THRESHOLDS = {
  pm25: { good: 36, normal: 76, bad: 100, veryBad: 110 },
  pm10: { good: 81, normal: 150, bad: 200, veryBad: 220 },
  co2: { good: 1001, normal: 1501, bad: 2001, veryBad: 2200 },
  co: { good: 11, normal: 21, bad: 25, veryBad: 27 },
  hcho: { good: 81, normal: 131, bad: 200, veryBad: 500 },
  voc: { good: 601, normal: 1001, bad: 1501, veryBad: 2001 },
} as const satisfies Record<string, GradeBands>;

export type JudgedMetric = keyof typeof GRADE_THRESHOLDS;

/**
 * 온도·습도 참고 구간 — **기준표에 없는 임시값이다.**
 *
 * 출처: 학교 배포본 `school_vaq/client/src/thresholds.ts`의 temp/hum 밴드.
 * 그 파일에도 "⚠️ 온도/습도는 기준표가 없어서 임시값"이라고 적혀 있다.
 *
 * 따라서 이 값으로 학교 상태(정상/주의/경고)를 판정하지 않는다.
 * 화면에 색만 참고로 입히고, 반드시 '참고' 표시를 함께 띄운다.
 * 현장 확정 기준이 오면 이 상수만 교체한다.
 */
export const REFERENCE_THRESHOLDS = {
  temp: { good: 18, normal: 26, bad: 30, veryBad: 33 },
  humidity: { good: 40, normal: 60, bad: 75, veryBad: 85 },
} as const satisfies Record<string, GradeBands>;

export type ReferenceMetric = keyof typeof REFERENCE_THRESHOLDS;

/** 온도·습도의 참고 등급. 판정이 아니라 표시용이다. */
export function referenceGrade(metric: ReferenceMetric, value: number): Grade {
  const t = REFERENCE_THRESHOLDS[metric];
  if (value >= t.veryBad) return 'veryBad';
  if (value >= t.bad) return 'bad';
  if (value >= t.normal) return 'normal';
  if (value >= t.good) return 'good';
  return 'veryGood';
}

/** 기준표 5단계 색상. 색상표 RGB를 그대로 옮긴 값이다. */
export const GRADE_COLOR: Record<Grade, string> = {
  veryGood: '#92D050', // 146.208.80
  good: '#F0EF00', // 240.239.0
  normal: '#FFC000', // 255.192.0
  bad: '#F00000', // 240.0.0
  veryBad: '#F00000', // 240.0.0 + 점멸
};

export const GRADE_LABEL: Record<Grade, string> = {
  veryGood: '매우좋음',
  good: '좋음',
  normal: '보통',
  bad: '나쁨',
  veryBad: '매우나쁨',
};

/** 매우나쁨만 점멸한다(기준표 '240.0.0점멸'). */
export function gradeBlinks(g: Grade): boolean {
  return g === 'veryBad';
}

export function metricGrade(metric: JudgedMetric, value: number): Grade {
  const t = GRADE_THRESHOLDS[metric];
  if (value >= t.veryBad) return 'veryBad';
  if (value >= t.bad) return 'bad';
  if (value >= t.normal) return 'normal';
  if (value >= t.good) return 'good';
  return 'veryGood';
}

const GRADE_RANK: Record<Grade, number> = {
  veryGood: 0,
  good: 1,
  normal: 2,
  bad: 3,
  veryBad: 4,
};

export function worstGrade(grades: Grade[]): Grade {
  return grades.reduce((a, b) => (GRADE_RANK[b] > GRADE_RANK[a] ? b : a), 'veryGood' as Grade);
}

export function readingGrade(r: Reading): Grade {
  const keys = Object.keys(GRADE_THRESHOLDS) as JudgedMetric[];
  return worstGrade(keys.map((k) => metricGrade(k, r[k])));
}

/**
 * 5단계 → 지도 3단계 축약.
 *
 * 100개교를 한 화면에서 볼 때 5색은 구분이 안 된다. 지도 마커와 집계 배지는
 * 3단계로 줄이고, 상세 패널·이력에서는 5단계를 그대로 보여준다.
 *
 * 경계: 매우좋음·좋음 → 정상 / 보통 → 주의 / 나쁨·매우나쁨 → 경고.
 * 기준표에서 빨강(240.0.0)이 '나쁨'부터이므로 경고도 '나쁨'부터로 맞춘다.
 */
export function gradeToStatus(g: Grade): Status {
  if (g === 'bad' || g === 'veryBad') return 'critical';
  if (g === 'normal') return 'warning';
  return 'normal';
}

export function metricStatus(metric: JudgedMetric, value: number): Status {
  return gradeToStatus(metricGrade(metric, value));
}

const RANK: Record<Status, number> = { normal: 0, warning: 1, critical: 2 };

export function worst(statuses: Status[]): Status {
  return statuses.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'normal' as Status);
}

export function readingStatus(r: Reading): Status {
  return gradeToStatus(readingGrade(r));
}

export const STATUS_LABEL: Record<Status, string> = {
  normal: '정상',
  warning: '주의',
  critical: '경고',
};

/**
 * 지도용 상태 3색. 검증기(dataviz)로 확인한 값이다 — 눈대중으로 바꾸지 말 것.
 * 기존 앰버(#F5A623)는 적색약에서 초록과 ΔE 4.5로 사실상 구분이 안 됐다.
 * 밝은 노랑으로 옮겨 ΔE 13.4 확보. 브랜드 액센트(#2DE1E1)와도 ΔE 23.8로 떨어져 있다.
 * 지도 마커는 색 외에 모양(원/삼각/사각)으로도 구분한다.
 *
 * 상세 패널의 5단계 색은 GRADE_COLOR(기준표 RGB)를 쓴다 — 서로 다른 용도다.
 */
export const STATUS_COLOR: Record<Status, string> = {
  normal: '#22C55E',
  warning: '#FDE047',
  critical: '#EF4444',
};

/**
 * 구 API 호환. 기존 호출부가 THRESHOLDS.warning/critical을 참조한다.
 * 3단계 경계를 기준표에서 끌어온다 — 주의=보통 시작, 경고=나쁨 시작.
 */
export const THRESHOLDS = Object.fromEntries(
  (Object.keys(GRADE_THRESHOLDS) as JudgedMetric[]).map((k) => [
    k,
    { warning: GRADE_THRESHOLDS[k].normal, critical: GRADE_THRESHOLDS[k].bad },
  ]),
) as Record<JudgedMetric, { warning: number; critical: number }>;
