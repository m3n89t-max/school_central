/**
 * 위경도 → 기상청 동네예보 격자(nx, ny).
 *
 * 기상청이 배포하는 공식 변환식(Lambert Conformal Conic)을 옮긴 것이다.
 * 상수는 바꾸지 말 것 — 기상청 격자 정의값이다.
 * 전국 5km 격자 149 × 253 = 37,697개. 제주 본섬은 약 160개 격자로 덮인다.
 */

const RE = 6371.00877; // 지구 반경 (km)
const GRID = 5.0; // 격자 간격 (km)
const SLAT1 = 30.0; // 투영 위도 1
const SLAT2 = 60.0; // 투영 위도 2
const OLON = 126.0; // 기준점 경도
const OLAT = 38.0; // 기준점 위도
const XO = 43; // 기준점 X좌표
const YO = 136; // 기준점 Y좌표

const DEGRAD = Math.PI / 180.0;

export interface Grid {
  nx: number;
  ny: number;
}

export function toGrid(lat: number, lon: number): Grid {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

/** 두 지점 사이 거리(km). 최근접 측정소를 고를 때만 쓰므로 하버사인이면 충분하다. */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * DEGRAD;
  const dLng = (bLng - aLng) * DEGRAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * DEGRAD) * Math.cos(bLat * DEGRAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}
