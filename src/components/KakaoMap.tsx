'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { School, Status } from '@/lib/types';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/thresholds';
import geo from '@/data/jeju-geo.json';
import {
  GRADE_COLOR,
  GRADE_OPACITY,
  REGIONS,
  pm10Grade,
  type OutdoorReading,
  type RegionId,
} from '@/lib/outdoor';
import { regionPolygons } from '@/lib/regionGeometry';

/**
 * 카카오맵 버전. 벡터맵과 비교용이다.
 *
 * 벡터맵이 못 주는 것: 줌·패닝, 마커 클러스터링, 실제 도로·지명.
 * 카카오맵이 못 주는 것: 다크 맵 타입(ROADMAP/SKYVIEW/HYBRID뿐).
 *
 * 다크는 타일에 CSS filter를 걸어 흉내 낸다.
 *
 * 컨테이너 전체에 걸면 그 위의 마커·클러스터까지 함께 반전·탈색된다.
 * 역필터로 되돌려 봤지만, 지도를 뉴트럴하게 만들 만큼 채도를 낮추면
 * 마커 색(= 상태를 나타내는 가장 중요한 신호)까지 같이 죽었다.
 * 그래서 타일 이미지를 담은 레이어에만 필터를 건다 — 오버레이는 건드리지 않는다.
 * 카카오가 클래스명을 주지 않으므로 img를 가장 많이 가진 div를 찾아 적용한다.
 * 정공법은 아니다. 카카오맵에 다크 맵 타입이 생기면 이 우회는 걷어내야 한다.
 */

declare global {
  interface Window {
    kakao: any;
  }
}

const SDK_ID = 'kakao-maps-sdk';
/** 타일에만 거는 다크 보정. 오버레이에는 적용되지 않으므로 채도를 과감히 낮출 수 있다. */
const TILE_FILTER = 'invert(1) hue-rotate(180deg) brightness(0.82) contrast(1.05) saturate(0.18)';

/** 타일 img를 가장 많이 담고 있는 레이어를 찾아 필터를 건다. */
function paintTiles(container: HTMLElement, on: boolean) {
  const layers = Array.from(container.querySelectorAll('div')).filter(
    (d) => d.querySelectorAll(':scope > img').length >= 4,
  );
  if (!layers.length) return;
  layers.sort(
    (a, b) => b.querySelectorAll(':scope > img').length - a.querySelectorAll(':scope > img').length,
  );
  layers[0].style.filter = on ? TILE_FILTER : '';
}
/** 이 레벨보다 축소하면 마커를 묶는다. 100개교 규모 대비. */
const CLUSTER_MIN_LEVEL = 7;

function loadSdk(appkey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps?.MarkerClusterer) return resolve();
    const onReady = () => window.kakao.maps.load(() => resolve());
    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', onReady);
      existing.addEventListener('error', () => reject(new Error('SDK 로드 실패')));
      return;
    }
    const el = document.createElement('script');
    el.id = SDK_ID;
    el.async = true;
    el.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false&libraries=clusterer`;
    el.addEventListener('load', onReady);
    // 도메인 미등록이면 카카오가 401 JSON을 돌려주고, 브라우저는 JS가 아니라며
    // ERR_BLOCKED_BY_ORB로 막는다. 그래서 여기서는 본문을 읽을 수 없다 —
    // 실제 확인은 서버에서 직접 호출해 봐야 한다.
    el.addEventListener('error', () => reject(new Error('domain')));
    document.head.appendChild(el);
  });
}

/** 상태별 마커. 벡터맵과 같은 규칙 — 색만으로 구분하지 않고 모양도 다르게 한다. */
function markerSvg(status: Status): string {
  const c = STATUS_COLOR[status];
  const shape =
    status === 'normal'
      ? `<circle cx="9" cy="9" r="6" fill="${c}" stroke="#0B0E13" stroke-width="2"/>`
      : status === 'warning'
        ? `<polygon points="9,2 16,15.5 2,15.5" fill="${c}" stroke="#0B0E13" stroke-width="2" stroke-linejoin="round"/>`
        : `<rect x="3" y="3" width="12" height="12" rx="1" fill="${c}" stroke="#0B0E13" stroke-width="2"/>`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18">${shape}</svg>`)}`;
}

/** 권역 폴리곤은 좌표가 고정이므로 한 번만 계산한다. */
const REGION_SHAPES = regionPolygons();

/** 권역 칩 HTML. 벡터맵 칩과 같은 정보를 같은 순서로 보여준다. */
function chipHtml(name: string, o: OutdoorReading, grade: string, color: string): string {
  const row = (l: string, v: string) =>
    `<span style="color:#79828F">${l}</span> <span style="color:#C9CFD8">${v}</span>`;
  return `<div style="transform:translate(-50%,-50%);width:124px;padding:6px 8px;border-radius:8px;
      background:rgba(12,16,21,.92);border:1px solid #2A323F;font-size:10px;line-height:1.6;
      font-family:inherit;pointer-events:none">
    <div style="display:flex;align-items:center;gap:5px;margin-bottom:1px">
      <i style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block"></i>
      <b style="color:#E6E8EB;font-size:12px">${name}</b>
      <span style="margin-left:auto;color:${color}">${grade}</span>
    </div>
    <div style="display:flex;justify-content:space-between">${row('PM10', String(o.pm10))}${row('PM2.5', String(o.pm25))}</div>
    <div style="display:flex;justify-content:space-between">${row('', o.temp + '℃')}${row('습도', o.humidity + '%')}</div>
  </div>`;
}

interface Props {
  schools: School[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  dark: boolean;
  outdoor: Record<RegionId, OutdoorReading> | null;
}

export default function KakaoMap({ schools, selectedId, onSelect, dark, outdoor }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const regionRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);

  const appkey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY;
  const select = useCallback((id: string) => onSelect(id), [onSelect]);
  const darkRef = useRef(dark);
  darkRef.current = dark;

  useEffect(() => {
    if (!appkey) {
      setError('NEXT_PUBLIC_KAKAO_MAP_API_KEY가 비어 있습니다.');
      return;
    }
    let cancelled = false;
    loadSdk(appkey)
      .then(() => {
        if (cancelled || !boxRef.current || mapRef.current) return;
        const { kakao } = window;
        const [minLng, minLat, maxLng, maxLat] = geo.mainBbox as number[];
        const map = new kakao.maps.Map(boxRef.current, {
          center: new kakao.maps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2),
          level: 10,
        });
        const b = new kakao.maps.LatLngBounds();
        b.extend(new kakao.maps.LatLng(minLat, minLng));
        b.extend(new kakao.maps.LatLng(maxLat, maxLng));
        map.setBounds(b);

        clustererRef.current = new kakao.maps.MarkerClusterer({
          map,
          averageCenter: true,
          minLevel: CLUSTER_MIN_LEVEL,
          disableClickZoom: false,
          // 클러스터 원. 타일에만 필터를 거므로 역보정이 필요 없다.
          styles: [
            {
              width: '36px',
              height: '36px',
              background: '#132027',
              border: '1px solid #2DE1E1',
              borderRadius: '18px',
              color: '#2DE1E1',
              textAlign: 'center',
              lineHeight: '34px',
              fontSize: '13px',
              fontWeight: '600',
            },
          ],
        });

        mapRef.current = map;
        setLevel(map.getLevel());
        kakao.maps.event.addListener(map, 'zoom_changed', () => setLevel(map.getLevel()));
        // 타일 레이어는 줌·패닝으로 다시 만들어질 수 있어 그때마다 다시 칠한다.
        kakao.maps.event.addListener(map, 'tilesloaded', () => {
          if (boxRef.current) paintTiles(boxRef.current, darkRef.current);
        });
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [appkey]);

  useEffect(() => {
    if (boxRef.current && ready) paintTiles(boxRef.current, dark);
  }, [dark, ready]);

  // 실외 4권역: 섬을 부채꼴로 자른 폴리곤 + 권역당 칩 하나.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const { kakao } = window;
    regionRef.current.forEach((o) => o.setMap(null));
    regionRef.current = [];
    if (!outdoor) return;

    for (const r of REGIONS) {
      const o = outdoor[r.id];
      const g = pm10Grade(o.pm10);
      for (const ring of REGION_SHAPES[r.id]) {
        const poly = new kakao.maps.Polygon({
          path: ring.map((p) => new kakao.maps.LatLng(p.lat, p.lng)),
          fillColor: GRADE_COLOR[g],
          // 다크 타일 위에서는 조금 진해야 보이고, 원래(밝은) 지도에서는 그대로가 적당하다.
          fillOpacity: GRADE_OPACITY[g] * (darkRef.current ? 1.35 : 1),
          strokeWeight: 1,
          strokeColor: GRADE_COLOR[g],
          strokeOpacity: 0.35,
          zIndex: 1,
        });
        poly.setMap(map);
        regionRef.current.push(poly);
      }
      const chip = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(r.chip.lat, r.chip.lng),
        content: chipHtml(r.name, o, g, GRADE_COLOR[g]),
        zIndex: 2,
      });
      chip.setMap(map);
      regionRef.current.push(chip);
    }
  }, [outdoor, ready, dark]);

  useEffect(() => {
    const map = mapRef.current;
    const clusterer = clustererRef.current;
    if (!map || !clusterer) return;
    const { kakao } = window;
    clusterer.clear();
    const markers = schools.map((s) => {
      const size = s.id === selectedId ? 26 : 18;
      const image = new kakao.maps.MarkerImage(markerSvg(s.status), new kakao.maps.Size(size, size), {
        offset: new kakao.maps.Point(size / 2, size / 2),
      });
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(s.lat, s.lng),
        image,
        title: `${s.name} · ${STATUS_LABEL[s.status]}`,
      });
      kakao.maps.event.addListener(marker, 'click', () => select(s.id));
      return marker;
    });
    clusterer.addMarkers(markers);
  }, [schools, selectedId, select, ready]);

  return (
    <div className="relative h-full w-full bg-[#090B0F]">
      <div ref={boxRef} className="h-full w-full" />

      {ready && (
        <div className="pointer-events-none absolute bottom-3 left-5 text-[11px] text-[#3E4653]">
          카카오맵 · 줌 레벨 {level} · 레벨 {CLUSTER_MIN_LEVEL} 이상에서 마커 묶임
        </div>
      )}

      {error && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center">
          <div>
            <p className="text-[13px] text-[#EF4444]">카카오맵을 불러오지 못했습니다</p>
            {error === 'domain' ? (
              <>
                <p className="mt-2 text-[12px] text-[#C9CFD8]">
                  이 앱키에 현재 도메인이 등록돼 있지 않습니다.
                </p>
                <p className="mt-1 font-mono text-[11px] text-[#79828F]">
                  401 AccessDeniedError · domain mismatched
                </p>
                <p className="mt-3 text-[11px] leading-relaxed text-[#4E5765]">
                  카카오 개발자 콘솔 → 내 애플리케이션 → 앱 설정 → 플랫폼 → Web →
                  <br />
                  사이트 도메인에 <code className="text-[#8A929E]">http://localhost:3000</code> 추가
                </p>
              </>
            ) : (
              <p className="mt-2 text-[12px] text-[#79828F]">{error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
