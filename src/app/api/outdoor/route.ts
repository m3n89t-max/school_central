import { NextResponse } from 'next/server';
import { SITES } from '@/lib/mock';
import { REGIONS, regionOf, type RegionId } from '@/lib/outdoor';
import { distanceKm, toGrid } from '@/lib/kmaGrid';

/**
 * 실외 공기질·기상 실측 조회. 서버에서만 돈다 — 인증키를 브라우저로 내보내지 않는다.
 *
 * 출처
 *  - 미세먼지: 에어코리아. 측정소 단위 → 학교마다 최근접 측정소 값.
 *  - 온습도: 기상청 초단기실황. 5km 격자 단위 → 학교 12곳이 고유 격자 8개로 묶인다.
 *
 * data.go.kr는 자주 죽는다. 실제로 겪은 것:
 *  - 503 SERVICETIMEOUT_ERROR("서비스 연결실패"), 504 게이트웨이 타임아웃이 수시로 난다.
 *  - 같은 요청이 직전엔 300ms에 되고 다음엔 4분을 끌기도 한다.
 * 그래서 (1) 요청마다 타임아웃을 걸고 (2) 마지막 성공분을 들고 있다가
 * 갱신에 실패하면 stale로 내려준다. 화면이 빈 채로 멈추는 것보다 낫다.
 * 결측치는 '-' 문자열로 오므로 숫자 변환 전에 걸러야 평균이 망가지지 않는다.
 */

export const dynamic = 'force-dynamic';

const KEY = process.env.AIRKOREA_SERVICE_KEY ?? '';
const KMA_KEY = process.env.KMA_SERVICE_KEY ?? '';
const EP_AIR =
  process.env.AIRKOREA_ENDPOINT_AIR || 'https://apis.data.go.kr/B552584/ArpltnInforInqireSvc';
const EP_STATION =
  process.env.AIRKOREA_ENDPOINT_STATION || 'https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc';
const KMA_EP =
  process.env.KMA_ENDPOINT || 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';

/**
 * 호출별 타임아웃. 측정소 목록은 응답이 400ms~10초로 편차가 크지만 6시간 캐시되니
 * 넉넉히 준다. 실시간 측정·기상은 자주 부르므로 짧게 잡고 빨리 실패시킨다.
 */
const TIMEOUT_STATION_MS = 20000;
const TIMEOUT_LIVE_MS = 8000;
const FRESH_MS = 10 * 60 * 1000; // 실외는 1시간 단위 데이터라 10분이면 신선하다
const STATION_TTL_MS = 6 * 60 * 60 * 1000; // 측정소 목록은 거의 안 바뀐다

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

let lastError = '';

async function getJson(
  url: string,
  tries = 3,
  timeoutMs = TIMEOUT_LIVE_MS,
): Promise<Record<string, any> | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
      if (r.ok) {
        const j = await r.json();
        if (j?.response?.body) return j;
        lastError = String(j?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg ?? '응답 본문 없음');
      } else {
        lastError = `HTTP ${r.status}`;
      }
    } catch (e) {
      const err = e as Error;
      lastError = err.name === 'TimeoutError' ? `요청 타임아웃(${timeoutMs}ms)` : err.message;
    }
    if (i < tries - 1) await new Promise((s) => setTimeout(s, 500 * 2 ** i));
  }
  return null;
}

const qs = (o: Record<string, string>) =>
  new URLSearchParams({ serviceKey: KEY, returnType: 'json', ...o }).toString();

interface Station {
  name: string;
  lat: number;
  lng: number;
}

let stationCache: { at: number; data: Station[] } | null = null;

async function fetchStations(): Promise<Station[]> {
  if (stationCache && Date.now() - stationCache.at < STATION_TTL_MS) return stationCache.data;
  const j = await getJson(
    `${EP_STATION}/getMsrstnList?` + qs({ numOfRows: '200', pageNo: '1', addr: '제주' }),
    2,
    TIMEOUT_STATION_MS,
  );
  const items: Array<Record<string, unknown>> = j?.response?.body?.items ?? [];
  const data = items
    .map((s) => ({ name: String(s.stationName), lat: num(s.dmX) ?? NaN, lng: num(s.dmY) ?? NaN }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  if (data.length) stationCache = { at: Date.now(), data };
  return data.length ? data : (stationCache?.data ?? []);
}

async function fetchAir() {
  const j = await getJson(
    `${EP_AIR}/getCtprvnRltmMesureDnsty?` +
      qs({ numOfRows: '100', pageNo: '1', sidoName: '제주', ver: '1.0' }),
  );
  const items: Array<Record<string, unknown>> = j?.response?.body?.items ?? [];
  const byStation = new Map<string, { pm10: number | null; pm25: number | null }>();
  for (const a of items) {
    byStation.set(String(a.stationName), { pm10: num(a.pm10Value), pm25: num(a.pm25Value) });
  }
  return { at: items[0] ? String(items[0].dataTime) : null, byStation };
}

/** 초단기실황은 매시 발표 후 40분쯤 지나야 조회된다. 한 시간 전 기준으로 부른다. */
async function fetchKma(nx: number, ny: number) {
  const kst = new Date(Date.now() - 60 * 60 * 1000 + 9 * 60 * 60 * 1000);
  const url =
    `${KMA_EP}/getUltraSrtNcst?` +
    new URLSearchParams({
      serviceKey: KMA_KEY,
      dataType: 'JSON',
      numOfRows: '20',
      pageNo: '1',
      base_date: kst.toISOString().slice(0, 10).replace(/-/g, ''),
      base_time: String(kst.getUTCHours()).padStart(2, '0') + '00',
      nx: String(nx),
      ny: String(ny),
    }).toString();
  const j = await getJson(url, 2);
  const items: Array<Record<string, unknown>> = j?.response?.body?.items?.item ?? [];
  const pick = (c: string) => num(items.find((i) => i.category === c)?.obsrValue);
  return { temp: pick('T1H'), humidity: pick('REH') };
}

export interface OutdoorReadingReal {
  pm10: number | null;
  pm25: number | null;
  temp: number | null;
  humidity: number | null;
}

export interface OutdoorPayload {
  ok: true;
  observedAt: string | null;
  stationCount: number;
  regions: Record<RegionId, OutdoorReadingReal>;
  schools: Record<string, OutdoorReadingReal & { station: string | null; stationKm: number | null }>;
}

let snapshot: { at: number; payload: OutdoorPayload } | null = null;

async function build(): Promise<OutdoorPayload | null> {
  const [stations, air] = await Promise.all([fetchStations(), fetchAir()]);
  if (!stations.length || !air.byStation.size) return null;

  const cells = new Map<string, { nx: number; ny: number }>();
  for (const s of SITES) {
    const g = toGrid(s.lat, s.lng);
    cells.set(`${g.nx},${g.ny}`, g);
  }
  const weather = new Map<string, { temp: number | null; humidity: number | null }>();
  await Promise.all(
    [...cells.entries()].map(async ([k, g]) => weather.set(k, await fetchKma(g.nx, g.ny))),
  );

  const schools: OutdoorPayload['schools'] = {};
  const bucket = Object.fromEntries(
    REGIONS.map((r) => [
      r.id,
      { pm10: [] as number[], pm25: [] as number[], temp: [] as number[], humidity: [] as number[] },
    ]),
  ) as Record<RegionId, { pm10: number[]; pm25: number[]; temp: number[]; humidity: number[] }>;

  for (const s of SITES) {
    const near = stations
      .map((st) => ({ st, d: distanceKm(s.lat, s.lng, st.lat, st.lng) }))
      .sort((a, b) => a.d - b.d)
      .find(({ st }) => air.byStation.get(st.name)?.pm10 != null);
    const pm = near ? air.byStation.get(near.st.name)! : { pm10: null, pm25: null };
    const g = toGrid(s.lat, s.lng);
    const w = weather.get(`${g.nx},${g.ny}`) ?? { temp: null, humidity: null };

    schools[s.id] = {
      ...pm,
      ...w,
      station: near?.st.name ?? null,
      stationKm: near ? +near.d.toFixed(1) : null,
    };

    const b = bucket[regionOf(s.lat, s.lng)];
    if (pm.pm10 != null) b.pm10.push(pm.pm10);
    if (pm.pm25 != null) b.pm25.push(pm.pm25);
    if (w.temp != null) b.temp.push(w.temp);
    if (w.humidity != null) b.humidity.push(w.humidity);
  }

  // 학교가 없는 권역(현재 동부)은 그 권역 안 측정소 평균으로 채운다.
  for (const r of REGIONS) {
    const b = bucket[r.id];
    if (b.pm10.length) continue;
    for (const st of stations) {
      if (regionOf(st.lat, st.lng) !== r.id) continue;
      const v = air.byStation.get(st.name);
      if (v?.pm10 != null) b.pm10.push(v.pm10);
      if (v?.pm25 != null) b.pm25.push(v.pm25);
    }
  }

  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const round = (v: number | null) => (v == null ? null : Math.round(v));
  const regions = Object.fromEntries(
    REGIONS.map((r) => {
      const b = bucket[r.id];
      const t = avg(b.temp);
      return [
        r.id,
        {
          pm10: round(avg(b.pm10)),
          pm25: round(avg(b.pm25)),
          temp: t == null ? null : +t.toFixed(1),
          humidity: round(avg(b.humidity)),
        },
      ];
    }),
  ) as OutdoorPayload['regions'];

  return { ok: true, observedAt: air.at, stationCount: stations.length, regions, schools };
}

export async function GET() {
  if (!KEY || !KMA_KEY) {
    return NextResponse.json({ ok: false, error: '인증키 미설정' }, { status: 500 });
  }
  if (snapshot && Date.now() - snapshot.at < FRESH_MS) {
    return NextResponse.json({ ...snapshot.payload, cached: true, fetchedAt: snapshot.at });
  }

  const fresh = await build().catch(() => null);
  if (fresh) {
    snapshot = { at: Date.now(), payload: fresh };
    return NextResponse.json({ ...fresh, cached: false, fetchedAt: snapshot.at });
  }
  // 갱신 실패 — 마지막 성공분이 있으면 stale로라도 내려준다.
  if (snapshot) {
    return NextResponse.json({
      ...snapshot.payload,
      stale: true,
      fetchedAt: snapshot.at,
      error: lastError,
    });
  }
  return NextResponse.json({ ok: false, error: '실외 데이터 조회 실패', detail: lastError }, { status: 502 });
}
