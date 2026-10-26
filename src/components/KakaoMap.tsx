'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { School } from '@/lib/types';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/thresholds';
import geo from '@/data/jeju-geo.json';
import {
  GRADE_COLOR,
  REGIONS,
  pm10Grade,
  type OutdoorReading,
  type RegionId,
} from '@/lib/outdoor';

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
/**
 * 이 레벨보다 축소하면 마커를 묶는다. 100개교 규모 대비.
 *
 * 제주 전도가 들어오는 초기 레벨이 10이라, 기준을 그보다 낮게 잡으면
 * 첫 화면에서 학교가 한 곳도 안 보이고 클러스터 원만 뜬다.
 * 전도에서도 개별 학교 상태가 보여야 관제 화면이므로 11로 둔다.
 */
const CLUSTER_MIN_LEVEL = 11;

/** 클러스터 판정용 자리표시자 마커 이미지. 1x1 투명 GIF — 화면에는 보이지 않는다. */
const BLANK_PIN =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * 지도 마커용 학교 건물 이미지.
 *
 * 대표님이 주신 school-miniature-v2.svg(1536x1024 PNG를 SVG로 감싼 2.3MB 파일)에서
 * 검정 배경과 초록 글로우를 제거하고 256px로 줄인 것이다. 원본을 그대로 쓰면
 * 지도에 검은 사각형이 생기고 용량도 마커 하나당 2.3MB가 된다.
 */
const SCHOOL_ICON = '/school.png';

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

/**
 * 학교 마커 HTML.
 *
 * 아이콘은 학교 건물 하나로 통일하고, 상태는 세 겹으로 전달한다.
 *   1) 아이콘 색  — 정상 초록 / 주의 노랑 / 경고 빨강
 *   2) 모서리 배지 — 원·삼각·사각. 색만으로 구분되지 않게 하는 보조 부호(적색약 대응)
 *   3) 점등        — 주의·경고만. 경고가 더 빠르다
 *
 * 카카오 Marker(이미지)로는 1)·2)까지만 되고 3)이 안 된다.
 * 그래서 CustomOverlay로 HTML을 올리고 점등은 CSS 애니메이션에 맡긴다.
 */
/**
 * 지도 레벨 → 마커 배율.
 *
 * 카카오 레벨은 숫자가 클수록 멀리 본다. 제주 전체는 8~9, 한 학교로
 * 확대하면 3이다. 멀리 볼수록 아이콘을 작게 해야 섬 모양이 보인다.
 *
 * 레벨 1단계는 축척 2배라 배율도 그에 맞춰 벌리면 전체 지도에서
 * 아이콘이 점이 된다. 그래서 선형으로 완만하게 깎는다.
 *   레벨 3(학교 확대) → 1.30
 *   레벨 6            → 1.00
 *   레벨 8(제주 전체) → 0.80
 *   레벨 9 이상       → 0.70 (하한)
 * 하한을 두는 이유는 50인치 TV에서 수 미터 떨어져 보기 때문이다.
 * 작아도 건물 형태와 상태색은 분간돼야 한다.
 */
function markerScale(level: number | null): number {
  if (level == null) return 1;
  return Math.max(0.7, Math.min(1.3, 1 + (6 - level) * 0.1));
}

function markerHtml(s: School, selected: boolean, scale = 1): string {
  const c = STATUS_COLOR[s.status];
  /*
    마커 크기 — 2026-10-26 대표님 지시로 지도 축척에 비례시킨다.
    "초기 전체지도 볼때 지도가 작고 학교아이콘이 너무 커 비율 맞춰줘"

    전에는 64px 고정이었다. 제주 전체(레벨 8~9)에서는 섬 폭이 화면의
    절반 남짓인데 건물이 64px이라, 12개가 몰린 제주시 북부가 아이콘
    덩어리로 뭉개졌다. 반대로 한 학교로 확대(레벨 3)하면 지도는 꽉
    찼는데 같은 64px이라 상대적으로 작아 보였다.

    scale은 호출부가 현재 지도 레벨에서 구해 넘긴다. 전체 지도에서는
    작게, 확대할수록 커진다. 축척이 바뀌면 아이콘도 같이 바뀌어야
    "지도 위의 건물"로 읽힌다.
  */
  const size = Math.round((selected ? 56 : 44) * scale);
  const pulse = s.status !== 'normal';

  // 상태 배지. 벡터맵과 같은 규칙 — 정상 원 / 주의 삼각 / 경고 사각.
  const badge =
    s.status === 'normal'
      ? `<circle cx="5" cy="5" r="3.4" fill="${c}" stroke="#0B0E13" stroke-width="1.6"/>`
      : s.status === 'warning'
        ? `<polygon points="5,1.2 9,8.2 1,8.2" fill="${c}" stroke="#0B0E13" stroke-width="1.6" stroke-linejoin="round"/>`
        : `<rect x="1.4" y="1.4" width="7.2" height="7.2" rx="0.8" fill="${c}" stroke="#0B0E13" stroke-width="1.6"/>`;

  // 입체 학교 건물 이미지(대표님 제공 school-miniature-v2.svg에서 배경을 제거한 PNG).
  //
  // 원본은 초록 한 가지 색이라 그대로 쓰면 주의·경고를 색으로 구분할 수 없다.
  // 그래서 CSS hue-rotate로 색조를 돌린다. 원본 벽면 색조가 94도이므로
  // 노랑(48도)까지 -46도, 빨강(5도)까지 -89도가 필요하다 — 측정해서 구한 값이다.
  //
  // 지붕이 어두워 작은 크기에서 전체가 탁해 보인다. 주의·경고는 대비를 올려
  // 벽면 색이 앞으로 나오게 한다.
  const tint =
    s.status === 'normal'
      ? 'saturate(1.2) brightness(1.05)'
      : s.status === 'warning'
        ? 'hue-rotate(-46deg) saturate(2.2) brightness(1.3) contrast(1.12)'
        : 'hue-rotate(-89deg) saturate(2.8) brightness(1.22) contrast(1.15)';

  // 건물 비율이 가로로 넓다(256x186). 세로를 기준으로 맞추면 너무 커지므로
  // 가로를 size에 맞추고 세로는 비율대로 둔다.
  const iw = Math.round(size * 1.34);
  const ih = Math.round(iw * (186 / 256));
  // Tailwind preflight의 `img{max-width:100%}`가 부모 폭에 맞춰 이미지를 줄여버린다.
  // 컨테이너를 건물 폭으로 잡고 max-width도 명시해 무력화한다.
  const school = `<img src="${SCHOOL_ICON}" alt="" width="${iw}" height="${ih}"
      style="display:block;width:${iw}px;height:${ih}px;max-width:none;
             filter:${tint} drop-shadow(0 2px 3px rgba(0,0,0,.95));
             image-rendering:-webkit-optimize-contrast;pointer-events:none">`;

  // 점등 링은 건물 중심(세로 절반)에 맞춘다. 건물이 가로로 넓어 지름도 가로 기준.
  const cy = ih / 2;
  const ringD = iw * 1.5;
  const ring = pulse
    ? `<span class="vaq-pulse${s.status === 'critical' ? ' vaq-pulse--critical' : ''}"
         style="position:absolute;left:50%;top:${cy}px;width:${ringD}px;height:${ringD}px;
                margin-left:${-ringD / 2}px;margin-top:${-ringD / 2}px;
                border-radius:50%;background:${c};pointer-events:none"></span>`
    : '';

  // 상태를 건물 색에만 기대지 않도록 바닥에 색 받침을 깐다.
  // 지붕이 어두워 작은 크기에서 건물 색만으로는 멀리서 읽히지 않는다.
  const padW = iw * 0.82;
  const plate = `<span style="position:absolute;left:50%;top:${ih - 3}px;
       width:${padW}px;height:${padW * 0.3}px;margin-left:${-padW / 2}px;
       border-radius:50%;background:${c};opacity:${s.status === 'normal' ? 0.5 : 0.75};
       filter:blur(${iw * 0.045}px);pointer-events:none"></span>`;

  const halo = selected
    ? `<span style="position:absolute;left:50%;top:${cy}px;width:${iw * 1.22}px;height:${iw * 1.22}px;
         margin-left:${(-iw * 1.22) / 2}px;margin-top:${(-iw * 1.22) / 2}px;
         border-radius:50%;border:2px solid ${c};opacity:.9;pointer-events:none"></span>`
    : '';

  // 학교명은 아이콘 **하단**에 항상 띄운다(2026-10-16 대표님 지시).
  // 글자도 마커와 같은 비율로 움직인다. 아이콘만 줄이고 글자를 두면
  // 이름표가 건물보다 커져 지도가 글자밭이 된다.
  const fs = Math.max(11, Math.round((selected ? 19 : 16) * scale));
  const label = `<span data-vaq-label="1" data-vaq-pri="${selected ? 3 : s.status === 'critical' ? 2 : s.status === 'warning' ? 1 : 0}"
       style="position:absolute;left:50%;top:${ih + 4}px;transform:translateX(-50%);
       white-space:nowrap;font-size:${fs}px;font-weight:${selected ? 800 : 700};
       color:${selected ? '#FFFFFF' : '#F2F4F7'};letter-spacing:-0.2px;
       padding:2px 7px;border-radius:5px;
       background:rgba(11,14,19,.78);border:1px solid ${c}66;
       text-shadow:0 1px 2px #0B0E13;
       pointer-events:none">${s.name}</span>`;

  return `<div title="${s.name} · ${STATUS_LABEL[s.status]}"
      style="position:relative;width:${iw}px;height:${ih}px;cursor:pointer">
    ${ring}${plate}${halo}
    <span style="position:relative;display:block">${school}</span>
    <span style="position:absolute;right:${-size * 0.16}px;bottom:${-size * 0.04}px;pointer-events:none">
      <svg width="18" height="18" viewBox="0 0 10 10">${badge}</svg>
    </span>
    ${label}
  </div>`;
}


/**
 * 본섬이 화면을 꽉 채우도록 지도 범위를 맞춘다.
 *
 * setBounds만 쓰면 카카오가 정수 레벨로 **올림**해 한 단계 더 멀어진다.
 * 그 결과 50인치 화면에서 섬이 가운데 작게 박히고 바다가 넓게 남는다.
 * 그래서 맞춘 뒤 실제 채움 비율을 재서, 한 단계 당겨도 섬이 잘리지
 * 않으면 당긴다. 화면 비율(가로로 긴 TV)에 따라 결과가 달라지므로
 * 상수로 박지 않고 그때그때 계산한다.
 */
function fitIsland(kakao: typeof window.kakao, map: any): void {
  const [minLng, minLat, maxLng, maxLat] = geo.islandBbox as number[];
  const sw = new kakao.maps.LatLng(minLat, minLng);
  const ne = new kakao.maps.LatLng(maxLat, maxLng);
  const b = new kakao.maps.LatLngBounds();
  b.extend(sw);
  b.extend(ne);
  map.setBounds(b);

  // 한 단계 당겼을 때 섬이 화면 안에 그대로 들어오는지 확인한 뒤에만 적용한다.
  const lv = map.getLevel();
  if (lv <= 1) return;
  map.setLevel(lv - 1);
  const v = map.getBounds();
  const vs = v.getSouthWest();
  const vn = v.getNorthEast();
  const fits =
    vs.getLat() <= minLat && vs.getLng() <= minLng && vn.getLat() >= maxLat && vn.getLng() >= maxLng;
  if (!fits) map.setLevel(lv);
  map.setCenter(new kakao.maps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2));
}

/**
 * 겹치는 학교명 라벨을 솎아낸다.
 *
 * 2026-10-23 대표님 지시로 글자를 17px까지 키우자 제주시 북부에서
 * 20쌍이 겹치고 최대 88%가 가려졌다("라중학교", "홀초등학교"처럼 잘려 읽힘).
 * 글자를 키운 효과가 겹침으로 상쇄된 셈이다.
 *
 * 글자를 다시 줄이는 대신, 겹치는 것만 숨긴다. 50인치에서 읽히는 크기를
 * 지키는 쪽이 우선이고, 가려진 학교는 어차피 못 읽던 것이다.
 *
 * 남길 우선순위는 경고 > 주의 > 정상, 선택된 학교는 항상 남긴다.
 * 관제 화면에서 이름이 꼭 필요한 건 문제가 난 학교다. 정상 학교는
 * 이름이 숨어도 건물 색과 받침으로 정상임이 전달된다.
 *
 * 숨겨도 아이콘·색·배지는 그대로 남으므로 "학교가 사라진" 것처럼 보이지 않는다.
 */
function hideCollidingLabels(map: any): void {
  void map;
  const els = Array.from(
    document.querySelectorAll<HTMLElement>('[data-vaq-label="1"]'),
  );
  if (els.length === 0) return;

  // 먼저 전부 되살린다. 지도를 움직이면 겹침 관계가 완전히 바뀌므로
  // 이전 판정을 남겨두면 한 번 숨은 라벨이 영영 돌아오지 않는다.
  els.forEach((e) => {
    e.style.visibility = 'visible';
    e.style.marginTop = '0px';
  });

  // 우선순위가 높은 것부터 자리를 차지한다.
  const items = els
    .map((el) => ({ el, pri: Number(el.dataset.vaqPri ?? 0), r: el.getBoundingClientRect() }))
    .filter((it) => it.r.width > 0)
    .sort((a, b) => b.pri - a.pri);

  const kept: DOMRect[] = [];
  for (const it of items) {
    const collides = (r: { left: number; right: number; top: number; bottom: number }) =>
      kept.some(
        (k) => r.left < k.right + 2 && r.right + 2 > k.left && r.top < k.bottom + 2 && r.bottom + 2 > k.top,
      );

    if (!collides(it.r)) {
      kept.push(it.r);
      continue;
    }

    /*
      경보·주의 학교(pri>=1)는 쉽게 포기하지 않는다.
      관제 화면에서 이름이 꼭 필요한 것이 바로 문제가 난 학교인데,
      먼저 자리를 잡은 이웃(심지어 같은 등급)에 막혀 숨으면 본말이 뒤집힌다.
      실제로 탐라중학교(경보)가 광령초등학교에 막혀 숨고, 정상 학교 4곳은
      이름이 보이는 상태가 나왔다.

      그래서 아래로 한 칸씩 내려 빈자리를 찾는다. 위가 아니라 아래로 내리는
      이유는 라벨이 건물 아래에 붙어 있어, 위로 올리면 건물 그림을 가리기
      때문이다. 세 칸까지만 시도하고 그래도 자리가 없으면 숨긴다 —
      더 멀리 보내면 어느 건물의 이름인지 알 수 없다.
    */
    let placed = false;
    if (it.pri >= 1) {
      const step = it.r.height + 3;
      for (let k = 1; k <= 3 && !placed; k++) {
        const moved = {
          left: it.r.left,
          right: it.r.right,
          top: it.r.top + step * k,
          bottom: it.r.bottom + step * k,
        };
        if (!collides(moved)) {
          it.el.style.marginTop = `${step * k}px`;
          kept.push(moved as DOMRect);
          placed = true;
        }
      }
    }
    if (!placed) it.el.style.visibility = 'hidden';
  }
}

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
  outdoor: Record<RegionId, OutdoorReading> | null;
  /**
   * 오토파일럿이 비추는 학교. 값이 오면 그 학교로 확대하고,
   * null이 되면 제주 전체로 돌아간다. 사람이 고른 selectedId와는 별개다.
   */
  focusId?: string | null;
  /** 확대 시 쓸 지도 레벨. 작을수록 가깝다. */
  focusLevel?: number;
}

export default function KakaoMap({
  schools,
  selectedId,
  onSelect,
  outdoor,
  focusId = null,
  focusLevel = 5,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const regionRef = useRef<any[]>([]);
  /** 학교 마커 CustomOverlay. 클러스터러가 관리하지 않으므로 직접 치운다. */
  const overlayRef = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);

  const appkey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY;
  const select = useCallback((id: string) => onSelect(id), [onSelect]);
  useEffect(() => {
    if (!appkey) {
      // 이펙트 본문에서 동기 setState를 하면 연쇄 렌더가 난다(react-hooks/set-state-in-effect).
      queueMicrotask(() => setError('NEXT_PUBLIC_KAKAO_MAP_API_KEY가 비어 있습니다.'));
      return;
    }
    let cancelled = false;
    loadSdk(appkey)
      .then(() => {
        if (cancelled || !boxRef.current || mapRef.current) return;
        const { kakao } = window;
        /*
          초기 범위는 본섬만 쓴다(2026-10-23 대표님 지시: "마라도 추자도는 빼").
          mainBbox는 마라도(위도 33.158)·추자도 일부를 포함해 섬이 화면
          가운데 작게 박히고 바다 여백이 과도했다. 설치 학교 12곳은 모두
          본섬 안에 있으므로 islandBbox로 꽉 채운다.
        */
        const [minLng, minLat, maxLng, maxLat] = geo.islandBbox as number[];
        const map = new kakao.maps.Map(boxRef.current, {
          center: new kakao.maps.LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2),
          level: 10,
        });
        fitIsland(kakao, map);

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
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [appkey]);

  /**
   * 오토파일럿 카메라 — 비출 학교로 확대하고, 풀리면 제주 전체로 돌아간다.
   *
   * panTo를 쓰는 이유: setCenter는 화면이 툭 끊겨 바뀐다. 멀리서 간헐적으로
   * 보는 화면에서는 '지도가 미끄러져 이동했다'는 과정이 보여야 관제자가
   * 어디에서 어디로 갔는지 따라갈 수 있다.
   *
   * 레벨을 먼저 맞추고 중심을 옮기는 순서다. 반대로 하면 축소 상태에서
   * 패닝한 뒤 확대돼 두 번 움직이는 것처럼 보인다.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const { kakao } = window;

    if (focusId) {
      const s = schools.find((x) => x.id === focusId);
      if (!s) return;
      map.setLevel(focusLevel, { animate: true });
      map.panTo(new kakao.maps.LatLng(s.lat, s.lng));
      return;
    }

    // 전체 복귀. 초기 진입과 같은 범위를 쓴다(본섬 기준, 꽉 채움).
    fitIsland(kakao, map);
    // schools를 의존성에 넣지 않는다. 측정값이 5초마다 바뀌며 배열이 새로
    // 만들어지는데, 그때마다 카메라를 다시 움직이면 지도가 계속 들썩인다.
    // 좌표는 고정이므로 focusId가 바뀔 때만 움직이면 충분하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusLevel, ready]);

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

      // 권역 배경 틴트는 걷어냈다(2026-10-23 대표님 지적).
      //
      // 섬 전체를 등급 색으로 덮으니 카카오맵 본래 색이 보라로 덧씌워져
      // 지명·도로가 묻혔다. 경계선을 지웠어도 '틴트의 경계'가 그대로 남아
      // 부채꼴 분할선이 실제 행정 경계처럼 읽히는 문제도 되살아났다.
      // 4분할은 한라산 방위각 **근사**일 뿐이라 그렇게 보이면 안 된다.
      //
      // 실외 등급은 권역 칩(색 점 + 등급 글자 + 실측 수치)으로만 전달한다.
      // 실내·실외 비교 판정은 lib/outdoorCompare.ts가 따로 맡는다.
      // 틴트를 되살리고 싶으면 칩이 못 주는 것이 무엇인지부터 답할 것.

      const chip = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(r.chip.lat, r.chip.lng),
        content: chipHtml(r.name, o, g, GRADE_COLOR[g]),
        zIndex: 2,
      });
      chip.setMap(map);
      regionRef.current.push(chip);
    }
  }, [outdoor, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const clusterer = clustererRef.current;
    if (!map || !clusterer) return;
    const { kakao } = window;
    clusterer.clear();

    // CustomOverlay는 Marker가 아니라 클러스터러가 받지 않는다.
    // 그래서 위치 계산용 투명 Marker를 클러스터러에 넣고(= 묶임 판정은 그대로),
    // 실제로 보이는 것은 같은 좌표의 CustomOverlay가 맡는다.
    //
    // 묶인 구간에서는 오버레이를 숨겨 클러스터 원만 남긴다.
    // 이 판정을 별도 이펙트로 두면 안 된다 — schools는 5초마다 새 배열이라
    // 이 이펙트가 재실행되는데, level이 안 변하면 숨김 이펙트는 다시 돌지 않아
    // 오버레이가 사라진 채로 남는다. 그래서 여기서 한 번에 처리한다.
    const clustered = level !== null && level >= CLUSTER_MIN_LEVEL;
    // 현재 축척에 맞는 마커 배율. 전체 지도에서는 작게, 확대하면 크게.
    const scale = markerScale(level);

    const markers = schools.map((s) => {
      const pos = new kakao.maps.LatLng(s.lat, s.lng);
      const selected = s.id === selectedId;

      // content로 문자열을 넘기면 getContent()가 문자열을 돌려줘 리스너를 걸 수 없다.
      // 엘리먼트를 직접 만들어 넘기고, 그 엘리먼트에 클릭을 건다.
      const el = document.createElement('div');
      el.innerHTML = markerHtml(s, selected, scale);

      const overlay = new kakao.maps.CustomOverlay({
        position: pos,
        content: el,
        // 겹칠 때 무엇이 위로 오는지 정한다.
        //
        // 1순위는 선택, 그다음 경고 > 주의 > 정상. 여기까진 기존과 같다.
        // 같은 등급끼리 겹치면(제주시 북부에 12쌍, 최대 89% 가림) 층이 같아
        // 그리는 순서대로 가려졌다. 남쪽 학교를 위에 둬 건물이 앞뒤로 서게 한다
        // — 화면 아래 = 앞이라는 통념과 맞고, 위도는 학교마다 달라 안정적이다.
        //
        // 제주 위도 범위(33.2~33.6)를 0~999로 펴 등급 간 간격(1000)을 넘지 않게 한다.
        zIndex:
          (selected ? 6 : s.status === 'critical' ? 5 : s.status === 'warning' ? 4 : 3) * 1000 +
          Math.max(0, Math.min(999, Math.round((33.6 - s.lat) * 2500))),
      });
      if (!clustered) overlay.setMap(map);
      overlayRef.current.push(overlay);

      el.addEventListener('click', (ev: MouseEvent) => {
        ev.stopPropagation();
        select(s.id);
      });

      // 클러스터 판정용 자리표시자. 보이지 않아야 하므로 1x1 투명 이미지를 쓴다.
      return new kakao.maps.Marker({
        position: pos,
        image: new kakao.maps.MarkerImage(BLANK_PIN, new kakao.maps.Size(1, 1)),
        clickable: false,
      });
    });
    clusterer.addMarkers(markers);
    // 오버레이 DOM이 붙은 뒤에 재야 한다. 같은 틱에 재면 폭이 0으로 나온다.
    const raf = requestAnimationFrame(() => hideCollidingLabels(map));

    return () => {
      cancelAnimationFrame(raf);
      overlayRef.current.forEach((o) => o.setMap(null));
      overlayRef.current = [];
    };
  }, [schools, selectedId, select, ready, level]);

  /*
    지도를 움직이면 라벨 간격이 바뀌므로 다시 솎아낸다.
    idle은 패닝·줌이 끝난 시점에 한 번만 오므로 드래그 중 매 프레임 계산하지 않는다.
  */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const { kakao } = window;
    const h = () => hideCollidingLabels(map);
    kakao.maps.event.addListener(map, 'idle', h);
    return () => kakao.maps.event.removeListener(map, 'idle', h);
  }, [ready]);

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
