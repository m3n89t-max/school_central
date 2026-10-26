import type { Reading, ZoneKind } from './types';
import type { Grade } from './thresholds';
import { readingGrade } from './thresholds';
import { SITES } from './mock';

/**
 * 1주일 시간대별 이력 — **목업이다.**
 *
 * 중앙관제에는 아직 DB가 없다(Supabase 프로젝트 미생성). 실데이터가 들어오면
 * 이 모듈의 `buildHistory`만 Supabase 조회로 바꾸면 되도록 호출부와 분리해 뒀다.
 *
 * 경기도교육청 매뉴얼 3.6절은 "월별 통계 및 분석 보고서"와 성능평가용
 * "2개월 이상 모니터링 데이터"를 요구한다. UI는 1주일을 보여주되(대표님 지시)
 * 데이터 구조는 기간을 늘려도 그대로 쓸 수 있게 시간 단위로 잡았다.
 */

/** 이력 1칸 = 1시간. */
export interface HistoryPoint {
  /** 기준 시각(정시). */
  at: Date;
  reading: Reading;
  grade: Grade;
  /** 조리 시간대인지. 급식 조리는 오전에 몰린다. */
  cooking: boolean;
}

export const HISTORY_DAYS = 7;
export const HISTORY_HOURS = HISTORY_DAYS * 24;

/**
 * 조리 시간대(목업 가정).
 * 실제 학교별 조리 시간표는 미확인이라 일반적인 급식 일정으로 둔다.
 * 평일 09~13시를 조리 피크로 본다. 주말은 조리 없음.
 */
function isCooking(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const h = d.getHours();
  return h >= 9 && h <= 12;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const BASE: Record<ZoneKind, Reading> = {
  조리실: { pm25: 44, pm10: 92, co2: 880, co: 4.0, hcho: 45, temp: 29.5, humidity: 58, voc: 320 },
  세척실: { pm25: 22, pm10: 48, co2: 720, co: 1.2, hcho: 28, temp: 27.0, humidity: 66, voc: 210 },
};

const ZONE_LOAD: Record<ZoneKind, number> = { 조리실: 1, 세척실: 0.6 };

/**
 * 과거 h시간 전부터 현재까지의 시간별 이력을 만든다.
 *
 * 비조리 시간대에는 부하를 크게 낮춘다 — 조리 중 상승은 정상 운영이고,
 * 비조리 시간대에 높게 유지되면 그게 설비 이상 신호다(진단의 핵심 가정).
 */
export function buildHistory(siteId: string, kind: ZoneKind, now: Date): HistoryPoint[] {
  const site = SITES.find((s) => s.id === siteId);
  if (!site) return [];

  const base = BASE[kind];
  const siteLoad = site.load * ZONE_LOAD[kind];
  const out: HistoryPoint[] = [];

  // 정시 기준으로 맞춘다.
  const end = new Date(now);
  end.setMinutes(0, 0, 0);

  for (let i = HISTORY_HOURS - 1; i >= 0; i--) {
    const at = new Date(end.getTime() - i * 3600_000);
    const cooking = isCooking(at);

    // 같은 (학교·구역·시각)이면 항상 같은 값 — 다시 열어도 그래프가 흔들리지 않는다.
    const rnd = mulberry32(hash(`${siteId}${kind}`) + Math.floor(at.getTime() / 3600_000));
    const jitter = (spread: number) => (rnd() - 0.5) * spread;

    // 조리 중 1.0배, 비조리 0.35배. 조리 직후 1시간은 잔류분 0.6배.
    const h = at.getHours();
    const residual = !cooking && h === 13 && at.getDay() !== 0 && at.getDay() !== 6;
    const dayFactor = cooking ? 1 : residual ? 0.6 : 0.35;
    const load = siteLoad * dayFactor;

    const reading: Reading = {
      pm25: Math.max(2, Math.round(base.pm25 * load + jitter(13))),
      pm10: Math.max(5, Math.round(base.pm10 * load + jitter(26))),
      co2: Math.max(400, Math.round(base.co2 * (0.75 + load * 0.4) + jitter(170))),
      co: Math.max(0.1, +(base.co * load + jitter(1.2)).toFixed(1)),
      hcho: Math.max(2, Math.round(base.hcho * load + jitter(14))),
      temp: +(base.temp - (cooking ? 0 : 2.5) + jitter(3.5)).toFixed(1),
      humidity: Math.round(base.humidity + jitter(10)),
      voc: Math.max(20, Math.round(base.voc * load + jitter(90))),
    };

    out.push({ at, reading, grade: readingGrade(reading), cooking });
  }

  return out;
}

/** 이력에서 한 항목만 뽑아 (시각, 값) 배열로. 차트용. */
export function seriesOf(points: HistoryPoint[], metric: keyof Reading): number[] {
  return points.map((p) => p.reading[metric]);
}

/** 일자별로 묶는다. 7개 그룹이 나온다. */
export function groupByDay(points: HistoryPoint[]): Array<{ day: Date; points: HistoryPoint[] }> {
  const map = new Map<string, HistoryPoint[]>();
  for (const p of points) {
    const key = `${p.at.getFullYear()}-${p.at.getMonth()}-${p.at.getDate()}`;
    const arr = map.get(key);
    if (arr) arr.push(p);
    else map.set(key, [p]);
  }
  return [...map.values()].map((ps) => ({ day: ps[0].at, points: ps }));
}
