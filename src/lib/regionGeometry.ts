import geo from '@/data/jeju-geo.json';
import { CENTER, REGIONS, type RegionId } from './outdoor';

/**
 * 권역 폴리곤 = 섬 모양 ∩ 한라산 기준 90° 부채꼴.
 *
 * SVG(벡터맵)는 clipPath로 잘라내면 그만이지만 카카오맵에는 그런 장치가 없어서
 * 실제 좌표를 잘라 kakao.maps.Polygon에 넘겨야 한다.
 * 90° 부채꼴은 중심을 지나는 반평면 두 개의 교집합이므로,
 * Sutherland–Hodgman으로 두 번 자르면 정확한 모양이 나온다.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const KX = Math.cos((CENTER.lat * Math.PI) / 180);

/** 중심 기준 국소 평면 좌표(동쪽, 북쪽). 단위는 위도 도(度)에 맞춘다. */
type P = [east: number, north: number];

const toLocal = (lng: number, lat: number): P => [(lng - CENTER.lng) * KX, lat - CENTER.lat];
const toLatLng = ([e, n]: P): LatLng => ({ lat: n + CENTER.lat, lng: e / KX + CENTER.lng });

const cross = (u: P, v: P) => u[0] * v[1] - u[1] * v[0];

/** 방위각(북 0도, 시계방향)의 단위 방향 벡터. */
function dir(bearingDeg: number): P {
  const r = (bearingDeg * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r)];
}

/**
 * 반평면 하나로 자른다. `keep`이 양수를 반환하는 쪽만 남긴다.
 * 경계를 지나는 변은 교점을 계산해 끼워 넣는다.
 */
function clipHalfPlane(poly: P[], keep: (p: P) => number): P[] {
  if (poly.length < 3) return [];
  const out: P[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = keep(a);
    const db = keep(b);
    if (da >= 0) out.push(a);
    if ((da >= 0 && db < 0) || (da < 0 && db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** 대략적인 면적(도²). 자르고 남은 파편을 버리는 데만 쓴다. */
function area(poly: P[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s / 2);
}

/** 이보다 작은 조각은 버린다(약 0.1km²). 자를 때 생기는 바늘 조각 제거용. */
const MIN_AREA = 1e-5;

/** 권역별로 잘라낸 섬 조각들. 카카오맵 Polygon에 그대로 넘길 수 있다. */
export function regionPolygons(): Record<RegionId, LatLng[][]> {
  const rings: P[][] = [];
  for (const f of geo.features) {
    for (const poly of f.geometry.coordinates) {
      rings.push(poly[0].map(([lng, lat]) => toLocal(lng, lat)));
    }
  }

  const out = {} as Record<RegionId, LatLng[][]>;
  for (const r of REGIONS) {
    const dFrom = dir(r.from);
    const dTo = dir(r.to);
    // 부채꼴 안쪽 = from 쪽 경계에서는 시계방향, to 쪽 경계에서는 반시계방향.
    const pieces: LatLng[][] = [];
    for (const ring of rings) {
      let clipped = clipHalfPlane(ring, (p) => -cross(dFrom, p));
      clipped = clipHalfPlane(clipped, (p) => cross(dTo, p));
      if (clipped.length >= 3 && area(clipped) >= MIN_AREA) {
        pieces.push(clipped.map(toLatLng));
      }
    }
    out[r.id] = pieces;
  }
  return out;
}
