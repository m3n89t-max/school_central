import type { Reading } from './types';
import type { OutdoorReading } from './outdoor';

/**
 * 실내-실외 대비 판정 — 급기 필터 진단의 첫 단추.
 *
 * ## 판정 원리 (직관 역전)
 *
 * 급기 필터가 제 역할을 하면 실외 오염은 실내로 들어오지 못한다.
 * 따라서 **실외와 실내의 상관이 낮은 것이 정상**이고, 실외가 나쁠 때 실내도 같이
 * 나빠지는 것이 이상 신호다 — 필터 파손, 누기, 바이패스, 또는 창문·틈새 외기 침입.
 *
 * 반대로 조리 중에는 실내 발생원(가스연소·유증기·분진)이 압도적이라 실외 영향이 묻힌다.
 * 그래서 "실내가 실외보다 훨씬 나쁨"은 조리 중이라면 정상일 수 있다.
 *
 * 즉 실내 절대값만 보고 경고를 내면 안 된다. 실외 대비 **패턴**을 봐야 한다.
 *
 *                     실외 좋음              실외 나쁨
 *   실내 좋음       │ clear                │ filterEffective  ← 가장 바람직
 *   실내 나쁨       │ indoorSource         │ infiltrationSuspect (수준 비슷할 때)
 *
 * diagnosis.ts의 풍속×상관 매트릭스와는 역할이 다르다. 그쪽은 시계열 상관과 덕트
 * 풍속이 모두 있어야 돌아가고(Phase 2), 이 모듈은 **단일 시점 스냅샷**만으로
 * 1차 선별을 한다. 두 결과가 엇갈리면 시계열 쪽이 우선이다.
 *
 * ## 비교 항목
 *
 * pm10, pm25 **뿐이다**. 실외 데이터(OutdoorReading)에는 PM 2종과 온습도만 있다.
 * CO2·CO·HCHO·VOC는 실외 대응값이 없으므로 이 모듈에서 다루지 않는다 —
 * 그 항목들은 실내 발생원 전용 지표라 실외 대비라는 개념 자체가 성립하지 않는다.
 *
 * ## 알려진 한계 (미확인 항목 — 임의로 확정하지 말 것)
 *
 * 1. **실외는 권역 평균이다.** 제주를 4권역으로 나눈 값이라 학교별 실제 외기와
 *    차이가 있다. 해안/내륙, 교통량, 국지 발생원이 반영되지 않는다. 학교 바로 옆
 *    외기 센서나 읍면동 단위 측정망으로 교체되기 전까지는 판정에 오차가 깔려 있다.
 * 2. **시차(lag)를 보정하지 않았다.** 외기가 급기구로 들어와 실내 센서에 잡히기까지
 *    덕트 길이·풍량에 따라 수 분~수십 분이 걸린다. 지금은 같은 시점끼리 비교하지만,
 *    제대로 하려면 시차 상관(lag correlation)이 필요하다. 실외가 급변하는 구간에서는
 *    이 모듈의 비율이 과소·과대 평가된다.
 * 3. **조리 시간표를 확보하지 못했다.** 조리 중인지 아닌지 알 수 없다. 조리 중에는
 *    실내 발생원이 압도적이라 판정이 달라져야 한다 — 특히 indoorSource는 조리 중이면
 *    정상이고 비조리 시간대면 환기 불량 또는 외기 침입 의심으로 읽어야 한다.
 *    시간표가 붙으면 isCooking 플래그를 받아 판정을 갈라야 한다.
 * 4. 실외 데이터는 1시간 해상도, 실내는 5초다. 해상도 격차 때문에 실외값은 사실상
 *    계단 함수이며, 한 실외 슬롯 안의 실내 변동은 모두 같은 실외값과 비교된다.
 *
 * 순수 함수 모듈이다. DOM·브라우저 API·React를 쓰지 않으므로 'use client'가 필요 없다.
 */

/* ------------------------------------------------------------------ *
 * 경계값 — 전부 잠정값(provisional). 현장 검증 전이다.
 * 조정은 이 블록만 고치면 된다.
 * ------------------------------------------------------------------ */

/** 이 모듈이 비교하는 항목. 실외 데이터에 있는 것으로 한정. */
export type ComparedMetric = 'pm10' | 'pm25';

export const COMPARED_METRICS: readonly ComparedMetric[] = ['pm10', 'pm25'] as const;

/**
 * "나쁨" 경계 (㎍/㎥) — **실내·실외에 같은 값을 적용한다.**
 *
 * 근거: outdoor.ts의 환경부 4단계 밴드에서 '나쁨'이 시작되는 지점.
 *   PM10  ... 좋음 ≤30, 보통 ≤80, 나쁨 ≤150  → 나쁨 시작 81
 *   PM2.5 ... 좋음 ≤15, 보통 ≤35, 나쁨 ≤75   → 나쁨 시작 36
 *
 * 왜 thresholds.ts의 실내 기준표(pm25 '나쁨' 100, pm10 200)를 쓰지 않는가:
 *   - 기준표는 **재실자 건강 경보**용이고 이 모듈은 **설비 진단**용이다. 목적이 다르다.
 *   - 더 결정적으로, 기준표 값을 쓰면 "둘 다 나쁘고 수준이 비슷함"이 거의 불가능해진다.
 *     실외 PM2.5가 100까지 가는 날은 드물기 때문이다. 외기 유입은 실내가 기준표상
 *     '좋음'에 머물러도(예: 실외 45, 실내 42) 이미 필터가 일을 안 하는 상태다.
 *   - 양쪽 모두 같은 오염물질의 ㎍/㎥이므로, 동일 밴드를 적용해야 비율·수준 비교가
 *     같은 축에서 성립한다.
 *
 * 따라서 이 값은 "화면에 경고를 띄울 선"이 아니라 "설비를 의심할 선"이다.
 * 대시보드 상태 색(thresholds.ts)과 다르게 나오는 것은 버그가 아니다.
 */
export const DIRTY_LEVEL: Record<ComparedMetric, number> = {
  pm10: 81,
  pm25: 36,
};

/**
 * 실내/실외 비율이 이 값 이상이면 "수준이 비슷함" = 여과가 사실상 안 되고 있음.
 *
 * 근거: 급기에 쓰는 중성능 필터(MERV 11~13 / KS F MV-3급 상당)는 PM2.5를 설계상
 * 50~80% 제거한다. 즉 정상이라면 실내/실외가 0.2~0.5 범위에 놓인다.
 * 0.7은 "제거율 30% 미만" — 설계 성능의 절반도 못 내는 상태로, 여유를 두고 잡은 선이다.
 * 잠정값: 실제 설치 필터 등급과 급기/재순환 비율을 확인해야 확정된다.
 */
export const RATIO_SIMILAR = 0.7;

/**
 * 실내/실외 비율이 이 값 이하면 "필터가 듣고 있음"으로 본다.
 *
 * 근거: 제거율 50% 이상 = 중성능 필터 설계 성능의 하단. RATIO_SIMILAR(0.7)와의
 * 사이 구간(0.5~0.7)은 판단을 유보하는 회색지대로 남긴다 — 권역 평균 오차와
 * 시차 미보정(한계 1·2)만으로도 비율이 이 폭으로 흔들릴 수 있기 때문이다.
 * 잠정값.
 */
export const RATIO_FILTER_OK = 0.5;

/**
 * 실내/실외 비율이 이 값 이상이면 실외가 나쁘더라도 "실내 발생원 우세"로 본다.
 *
 * 근거: 실내가 실외의 2배에 가까우면 유입만으로는 설명이 안 된다(유입은 비율 1을
 * 넘을 수 없다). 초과분은 실내 발생원이다 — 조리가 가장 흔한 원인이다.
 * 1.8은 권역 평균 오차(한계 1)를 감안해 1.0보다 넉넉히 띄운 값이다.
 * 잠정값: 조리 시간표(한계 3)가 붙으면 조리 중/비조리로 갈라 다시 잡아야 한다.
 */
export const RATIO_INDOOR_DOMINANT = 1.8;

/**
 * 실외값이 이 아래면 비율을 쓰지 않는다 (㎍/㎥).
 *
 * 근거: 분모가 작을 때 비율이 폭발한다. 실외 PM2.5 3, 실내 9면 비율 3.0이지만
 * 실제로는 둘 다 깨끗하고 차이는 센서 오차 수준이다. 환경부 '좋음' 밴드의 하단
 * 부근(PM10 10, PM2.5 5)을 바닥으로 잡아 그 아래는 비율 산출을 포기한다.
 * 잠정값: 센서 검출한계(LOD) 확인 후 조정.
 */
export const RATIO_FLOOR: Record<ComparedMetric, number> = {
  pm10: 10,
  pm25: 5,
};

/* ------------------------------------------------------------------ *
 * 판정 구분
 * ------------------------------------------------------------------ */

/**
 * 실내-실외 대비 판정.
 *
 * - `infiltrationSuspect` 실외도 나쁘고 실내도 나쁘며 수준이 비슷함
 *                         → 외기 유입 의심. 필터 파손·누기·바이패스·틈새 침입.
 * - `indoorSource`        실외는 괜찮은데 실내만 나쁨
 *                         → 실내 발생원(조리 등). 환기 성능 문제일 수도 있음.
 * - `filterEffective`     실외는 나쁜데 실내는 좋음 → 필터 정상. 가장 바람직한 상태.
 * - `clear`               둘 다 좋음 → 정상. 단 실외가 깨끗하면 필터 성능은 검증되지 않는다.
 * - `indeterminate`       회색지대 또는 비율 산출 불가 → 판단 유보.
 */
export type OutdoorCompareVerdict =
  | 'infiltrationSuspect'
  | 'indoorSource'
  | 'filterEffective'
  | 'clear'
  | 'indeterminate';

export const VERDICT_LABEL: Record<OutdoorCompareVerdict, string> = {
  infiltrationSuspect: '외기 유입 의심',
  indoorSource: '실내 발생원',
  filterEffective: '필터 정상',
  clear: '정상',
  indeterminate: '판단 유보',
};

/**
 * 종합 판정을 고를 때의 우선순위. 조치가 급한 쪽이 높다.
 *
 * filterEffective가 clear보다 높은 이유: 둘 다 '문제 없음'이지만 filterEffective는
 * 실외가 나쁜 와중에 막아냈다는 **증거**가 있고 clear는 아무 증거가 없다.
 * 정보량이 많은 쪽을 종합 판정으로 올린다.
 * indeterminate는 최하위 — 다른 항목이 뭔가 말하고 있으면 그쪽을 쓴다.
 */
const VERDICT_RANK: Record<OutdoorCompareVerdict, number> = {
  infiltrationSuspect: 4,
  indoorSource: 3,
  filterEffective: 2,
  clear: 1,
  indeterminate: 0,
};

/* ------------------------------------------------------------------ *
 * 결과 형태
 * ------------------------------------------------------------------ */

/** 항목 하나의 비교 결과. 판단 근거 수치를 모두 들고 있다. */
export interface MetricComparison {
  metric: ComparedMetric;
  /** 실내 측정값 ㎍/㎥. */
  indoor: number;
  /** 권역 실외 측정값 ㎍/㎥ (권역 평균 — 한계 1). */
  outdoor: number;
  /** 실내/실외 비율. 실외가 RATIO_FLOOR 미만이면 null. */
  ratio: number | null;
  /** 실내 - 실외 ㎍/㎥. 비율이 못 미더울 때 보조로 본다. */
  delta: number;
  indoorDirty: boolean;
  outdoorDirty: boolean;
  verdict: OutdoorCompareVerdict;
}

export interface OutdoorCompareResult {
  /** 항목별 판정을 VERDICT_RANK로 집계한 학교(구역) 종합 판정. */
  verdict: OutdoorCompareVerdict;
  /** 종합 판정을 끌어낸 항목. 전 항목이 indeterminate면 null. */
  drivingMetric: ComparedMetric | null;
  /** 항목별 상세. COMPARED_METRICS 순서. */
  metrics: MetricComparison[];
  /** 비율을 낼 수 있었던 항목들의 평균 실내/실외 비율. 없으면 null. */
  meanRatio: number | null;
  /**
   * 필터 성능을 판정할 근거가 있었는지.
   * 실외가 깨끗하면(= 어느 항목도 outdoorDirty 아님) 필터가 좋은지 나쁜지 알 수 없다.
   * false면 clear/indoorSource 판정을 "필터 정상"으로 읽어서는 안 된다.
   */
  filterAssessable: boolean;
}

/* ------------------------------------------------------------------ *
 * 판정
 * ------------------------------------------------------------------ */

function compareMetric(
  metric: ComparedMetric,
  indoorValue: number,
  outdoorValue: number,
): MetricComparison {
  const indoorDirty = indoorValue >= DIRTY_LEVEL[metric];
  const outdoorDirty = outdoorValue >= DIRTY_LEVEL[metric];
  const ratio =
    outdoorValue >= RATIO_FLOOR[metric] && outdoorValue > 0 ? indoorValue / outdoorValue : null;
  const delta = indoorValue - outdoorValue;

  const base = { metric, indoor: indoorValue, outdoor: outdoorValue, ratio, delta, indoorDirty, outdoorDirty };

  // 실외가 깨끗한 경우 — 비율은 의미가 없다. 실내 절대값만으로 갈린다.
  // 실외에서 들어온 게 아니므로 실내 발생원이거나 아무 문제 없음이다.
  if (!outdoorDirty) {
    return { ...base, verdict: indoorDirty ? 'indoorSource' : 'clear' };
  }

  // 여기부터 실외가 나쁘다 = 필터를 시험할 조건이 갖춰졌다.

  // 분모가 바닥 미만이면 실외가 '나쁨'인데 RATIO_FLOOR 아래라는 모순 상태다
  // (DIRTY_LEVEL > RATIO_FLOOR이므로 정상 경로에서는 도달하지 않는다).
  // 경계값을 나중에 조정했을 때를 대비한 방어 분기.
  if (ratio === null) {
    return { ...base, verdict: 'indeterminate' };
  }

  // 실내가 실외의 2배 가까이 — 유입만으로 설명 불가. 초과분은 실내 발생원이다.
  // 조리 중이라면 정상일 수 있다(한계 3: 조리 여부를 알 수 없음).
  if (ratio >= RATIO_INDOOR_DOMINANT) {
    return { ...base, verdict: 'indoorSource' };
  }

  // 실내가 실외를 따라가고 있다 = 여과가 안 되고 있다.
  // 실내도 '나쁨'까지 올라와 있어야 유입이 실제로 해를 끼치는 중이라고 본다.
  if (ratio >= RATIO_SIMILAR && indoorDirty) {
    return { ...base, verdict: 'infiltrationSuspect' };
  }

  // 비율은 높은데 실내는 아직 '나쁨' 아래 — 유입 조짐이지만 단정하지 않는다.
  // 실외가 '나쁨' 하단에 겨우 걸친 경우가 여기 들어온다.
  if (ratio >= RATIO_SIMILAR) {
    return { ...base, verdict: 'indeterminate' };
  }

  // 실외가 나쁜데 실내는 걸러졌다 — 가장 바람직한 상태.
  if (ratio <= RATIO_FILTER_OK && !indoorDirty) {
    return { ...base, verdict: 'filterEffective' };
  }

  // 회색지대(0.5~0.7) 또는 비율은 낮지만 실내가 나쁜 경우.
  // 후자는 실외 유입 + 실내 발생원이 겹친 상태일 수 있어 단일 시점으로는 못 가른다.
  return { ...base, verdict: indoorDirty ? 'indoorSource' : 'indeterminate' };
}

/**
 * 학교(구역) 하나의 실내 측정값을 그 학교가 속한 권역의 실외 측정값과 대비해 판정한다.
 *
 * 권역은 호출부에서 outdoor.ts의 `regionOf(school.lat, school.lng)`로 구해
 * 해당 권역의 OutdoorReading을 넘겨준다. 이 함수는 권역 판별에 관여하지 않는다.
 *
 * 온도·습도는 실외에도 있지만 오염물질이 아니라 "나쁨" 방향이 하나로 정해지지 않아
 * (여름엔 높은 쪽, 겨울엔 낮은 쪽이 문제) 이 판정에서 제외한다.
 */
export function compareIndoorOutdoor(
  indoor: Reading,
  outdoor: OutdoorReading,
): OutdoorCompareResult {
  const metrics = COMPARED_METRICS.map((m) => compareMetric(m, indoor[m], outdoor[m]));

  let verdict: OutdoorCompareVerdict = 'indeterminate';
  let drivingMetric: ComparedMetric | null = null;
  for (const mc of metrics) {
    if (VERDICT_RANK[mc.verdict] > VERDICT_RANK[verdict]) {
      verdict = mc.verdict;
      drivingMetric = mc.metric;
    }
  }
  // 전 항목이 indeterminate면 위 루프가 아무것도 고르지 못한다(최하위 랭크라
  // 초기값을 넘어서지 못함). 그래도 근거 수치는 보여줘야 하므로 첫 항목을 집는다.
  if (drivingMetric === null) {
    drivingMetric = metrics.find((m) => m.verdict === verdict)?.metric ?? null;
  }

  const ratios = metrics.map((m) => m.ratio).filter((r): r is number => r !== null);
  const meanRatio =
    ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;

  return {
    verdict,
    drivingMetric,
    metrics,
    meanRatio,
    filterAssessable: metrics.some((m) => m.outdoorDirty),
  };
}

/** 소수 둘째 자리까지. 화면 문장에 쓸 용도. */
function fmtRatio(r: number): string {
  return r.toFixed(2);
}

/**
 * 판정 결과를 사람이 읽는 한국어 한 문장으로 바꾼다.
 *
 * 한 문장 안에 (1) 무슨 상태인지 (2) 근거 수치 (3) 다음 행동을 담는다.
 * 관제 화면에서 운영자가 한 줄만 읽고 판단할 수 있어야 한다.
 */
export function describeOutdoorCompare(result: OutdoorCompareResult): string {
  const { verdict, drivingMetric, metrics, meanRatio } = result;
  const mc = drivingMetric ? metrics.find((m) => m.metric === drivingMetric) : undefined;
  const name = mc ? (mc.metric === 'pm25' ? 'PM2.5' : 'PM10') : '';
  const pair = mc ? `실외 ${mc.outdoor}㎍/㎥ 대비 실내 ${mc.indoor}㎍/㎥` : '';
  const ratioText = mc?.ratio !== null && mc?.ratio !== undefined ? `비율 ${fmtRatio(mc.ratio)}` : '';

  switch (verdict) {
    case 'infiltrationSuspect':
      return `외기 유입 의심 — ${name} ${pair}로 ${ratioText}, 실외 오염이 거의 걸러지지 않고 있어 급기 필터 파손·누기 또는 창문·틈새 침입을 점검해야 합니다.`;

    case 'indoorSource':
      return `실내 발생원 우세 — ${name} ${pair}로 ${ratioText}, 실외보다 실내가 높아 조리 등 실내 발생이 원인으로 보이며 배기·환기 성능을 함께 확인해야 합니다.`;

    case 'filterEffective':
      return `필터 정상 작동 — ${name} ${pair}로 ${ratioText}, 실외가 나쁜 상황에서 실내가 낮게 유지되어 급기 여과가 듣고 있습니다.`;

    case 'clear':
      return `정상 — 실내외 모두 양호합니다${
        meanRatio !== null ? ` (실내/실외 비율 ${fmtRatio(meanRatio)})` : ''
      }. 다만 실외가 깨끗해 필터 성능은 이번 비교로 검증되지 않았습니다.`;

    case 'indeterminate':
      return `판단 유보 — ${
        mc && ratioText ? `${name} ${pair}로 ${ratioText}이나 ` : ''
      }경계 구간에 걸쳐 있어 단일 시점 비교로는 외기 유입과 실내 발생을 가를 수 없습니다.`;
  }
}
