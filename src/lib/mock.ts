import type { Reading, School, Status, Zone, ZoneKind } from './types';
import { readingStatus, worst } from './thresholds';

/**
 * 실제 설치 학교 12곳(2026-09-01 확인). 좌표·행정동은 카카오 로컬 API로 조회한 실제 값이다.
 *
 * 학교명과 위치는 진짜지만 **측정값은 전부 목업이다.** 실명이 붙은 만큼
 * 화면에서 목업임을 반드시 드러내야 한다(CLAUDE.md 4. 데이터 신뢰도 표시).
 *
 * load: 학교별 고정 오염 부하(환기 성능 차이를 대신하는 목업 계수).
 * 무작위로 두면 경고가 거의 안 나와 데모에서 세 상태가 모두 보이도록 배분했다.
 */
export type Site = Omit<School, 'zones' | 'status'> & { load: number };

export const SITES: Site[] = [
  { id: 'JJ-01', name: '도남초등학교', city: '제주시', region: '이도2동', lat: 33.4938, lng: 126.5259, load: 0.62 },
  { id: 'JJ-02', name: '금악초등학교', city: '제주시', region: '한림읍', lat: 33.3568, lng: 126.2957, load: 1.72 },
  { id: 'JJ-03', name: '대흘초등학교', city: '제주시', region: '조천읍', lat: 33.4996, lng: 126.6578, load: 0.85 },
  { id: 'JJ-04', name: '광령초등학교', city: '제주시', region: '애월읍', lat: 33.4594, lng: 126.4366, load: 2.45 },
  { id: 'JJ-05', name: '제주동초등학교', city: '제주시', region: '건입동', lat: 33.5145, lng: 126.5333, load: 1.55 },
  { id: 'JJ-06', name: '납읍초등학교', city: '제주시', region: '애월읍', lat: 33.4354, lng: 126.3306, load: 0.70 },
  { id: 'JJ-07', name: '제주남초등학교', city: '제주시', region: '삼도2동', lat: 33.5100, lng: 126.5213, load: 0.95 },
  { id: 'JJ-08', name: '장전초등학교', city: '제주시', region: '애월읍', lat: 33.4494, lng: 126.3904, load: 1.15 },
  { id: 'JJ-09', name: '탐라중학교', city: '제주시', region: '아라동', lat: 33.4918, lng: 126.5452, load: 2.30 },
  { id: 'JJ-10', name: '제주중앙여자중학교', city: '제주시', region: '삼도2동', lat: 33.5052, lng: 126.5211, load: 0.78 },
  { id: 'SG-01', name: '서귀포여자고등학교', city: '서귀포시', region: '대륜동', lat: 33.2439, lng: 126.5316, load: 1.62 },
  { id: 'SG-02', name: '대정서초등학교', city: '서귀포시', region: '대정읍', lat: 33.2322, lng: 126.2391, load: 0.66 },
];

export const SITE_COUNT = SITES.length;

/** 결정론적 PRNG — 같은 seed면 서버와 클라이언트가 같은 값을 낸다(hydration 불일치 방지). */
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

/** 구역별 기준 측정값. 조리흄·가스연소 때문에 조리실이 세척실보다 높다. */
const BASE: Record<ZoneKind, Reading> = {
  조리실: { pm25: 44, pm10: 92, co2: 880, co: 4.0, hcho: 45, temp: 29.5, humidity: 58, voc: 320 },
  세척실: { pm25: 22, pm10: 48, co2: 720, co: 1.2, hcho: 28, temp: 27.0, humidity: 66, voc: 210 },
};

/** 세척실은 같은 학교라도 조리실보다 부하가 낮다. */
const ZONE_LOAD: Record<ZoneKind, number> = { 조리실: 1, 세척실: 0.6 };

function makeZone(site: Site, kind: ZoneKind, tick: number): Zone {
  const rnd = mulberry32(hash(site.id + kind) + tick * 7919);
  const base = BASE[kind];
  const load = site.load * ZONE_LOAD[kind];
  const jitter = (spread: number) => (rnd() - 0.5) * spread;

  const reading: Reading = {
    pm25: Math.max(2, Math.round(base.pm25 * load + jitter(13))),
    pm10: Math.max(5, Math.round(base.pm10 * load + jitter(26))),
    co2: Math.max(400, Math.round(base.co2 * (0.75 + load * 0.4) + jitter(170))),
    co: Math.max(0.1, +(base.co * load + jitter(1.2)).toFixed(1)),
    hcho: Math.max(2, Math.round(base.hcho * load + jitter(14))),
    temp: +(base.temp + jitter(3.5)).toFixed(1),
    humidity: Math.round(base.humidity + jitter(10)),
    voc: Math.max(20, Math.round(base.voc * load + jitter(90))),
  };

  return { id: `${site.id}-${kind}`, kind, reading, status: readingStatus(reading) };
}

/** tick을 올리면 새 측정값 한 세트가 나온다. 5초마다 호출한다. */
export function buildSchools(tick: number): School[] {
  return SITES.map((site) => {
    const zones: Zone[] = (['조리실', '세척실'] as ZoneKind[]).map((k) => makeZone(site, k, tick));
    // load는 목업 내부 계수라 School에 싣지 않는다.
    return {
      id: site.id,
      name: site.name,
      city: site.city,
      region: site.region,
      lat: site.lat,
      lng: site.lng,
      zones,
      status: worst(zones.map((z) => z.status)),
    };
  });
}

export function countByStatus(schools: School[]): Record<Status, number> {
  const out: Record<Status, number> = { normal: 0, warning: 0, critical: 0 };
  for (const s of schools) out[s.status]++;
  return out;
}
