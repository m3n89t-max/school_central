import type { School, Status } from './types';

/**
 * 유지보수 진단 (CLAUDE.md 5절).
 *
 * 전제: 필터가 정상이면 실외-실내 상관은 낮아야 한다. 상관이 높은 건 이상 신호다.
 * 풍속과 상관을 교차하면 고장 유형이 갈린다 — 한 지표만으로는 구분되지 않는다.
 *
 *                 상관 낮음              상관 높음
 *   풍속 정상   │ 정상                 │ 필터 파손·누기
 *   풍속 낮음   │ 필터 막힘(교체 시기)  │ 급기 정지 + 외기 침입
 *
 * 목업이다. 실제 풍속은 Phase 2에서 덕트 풍속센서를 485로 붙여야 나온다.
 */

export type DiagnosisId = 'ok' | 'clogged' | 'leak' | 'stopped';

/** 기준 풍량 대비 이 비율 아래면 "풍속 낮음". */
export const AIRFLOW_LOW = 0.75;
/** 시차 상관이 이 값을 넘으면 "상관 높음". */
export const CORR_HIGH = 0.5;

export interface Diagnosis {
  id: DiagnosisId;
  label: string;
  /** 화면에 띄울 한 줄 설명. */
  detail: string;
  status: Status;
}

export const DIAGNOSES: Record<DiagnosisId, Diagnosis> = {
  ok: { id: 'ok', label: '정상', detail: '풍량 정상, 실외 영향 차단됨', status: 'normal' },
  clogged: {
    id: 'clogged',
    label: '필터 막힘',
    detail: '여과는 되지만 바람이 안 통함 — 교체 시기',
    status: 'warning',
  },
  leak: {
    id: 'leak',
    label: '필터 파손·누기',
    detail: '바람은 도는데 걸러지지 않음 — 점검 필요',
    status: 'critical',
  },
  stopped: {
    id: 'stopped',
    label: '급기 정지·외기 침입',
    detail: '급기가 멎고 틈새로 외기 유입 — 즉시 조치',
    status: 'critical',
  },
};

export interface SchoolDiagnosis {
  schoolId: string;
  /** 기준 풍량 대비 현재 풍속 비율. */
  airflow: number;
  /** 실외↔실내 PM2.5 시차 상관계수 (0~1). */
  correlation: number;
  diagnosis: Diagnosis;
}

/**
 * 학교별 고정 목업값.
 * 무작위로 두면 사분면이 한쪽으로 쏠려 매트릭스가 망가지므로 네 칸에 고루 배치했다.
 */
const FIXTURES: Record<string, [airflow: number, correlation: number]> = {
  'JJ-01': [0.98, 0.18],
  'JJ-02': [0.92, 0.28],
  'JJ-03': [0.62, 0.22],
  'JJ-04': [0.95, 0.71],
  'JJ-05': [1.02, 0.15],
  'JJ-06': [0.88, 0.31],
  'JJ-07': [0.68, 0.35],
  'JJ-08': [0.94, 0.24],
  'JJ-09': [0.41, 0.78],
  'JJ-10': [0.99, 0.2],
  'SG-01': [0.9, 0.42],
  'SG-02': [0.71, 0.19],
};

export function classify(airflow: number, correlation: number): Diagnosis {
  const lowFlow = airflow < AIRFLOW_LOW;
  const highCorr = correlation > CORR_HIGH;
  if (lowFlow && highCorr) return DIAGNOSES.stopped;
  if (lowFlow) return DIAGNOSES.clogged;
  if (highCorr) return DIAGNOSES.leak;
  return DIAGNOSES.ok;
}

export function buildDiagnoses(schools: School[]): SchoolDiagnosis[] {
  return schools.map((s) => {
    const [airflow, correlation] = FIXTURES[s.id] ?? [1, 0.2];
    return { schoolId: s.id, airflow, correlation, diagnosis: classify(airflow, correlation) };
  });
}
