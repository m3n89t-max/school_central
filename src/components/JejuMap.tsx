'use client';

import { useMemo } from 'react';
import geo from '@/data/jeju-geo.json';
import type { School, Status } from '@/lib/types';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/thresholds';
import {
  CENTER,
  GRADE_COLOR,
  GRADE_OPACITY,
  REGIONS,
  pm10Grade,
  type OutdoorReading,
  type RegionId,
} from '@/lib/outdoor';

/**
 * 제주 커스텀 벡터맵.
 * 통계청 2013 행정구역 GeoJSON(제주시·서귀포시)을 단순화해 SVG로 직접 그린다.
 * 외부 지도 API·타일 서버를 쓰지 않아 오프라인에서도 동작한다.
 */

const PAD = 48;
const WIDTH = 1000;

// 등장방형 도법 + 위도 보정. 제주 정도의 좁은 범위에서는 왜곡이 무시할 수준이다.
const [MIN_LNG, MIN_LAT, MAX_LNG, MAX_LAT] = geo.mainBbox as [number, number, number, number];
const KX = Math.cos((((MIN_LAT + MAX_LAT) / 2) * Math.PI) / 180);
const SCALE = WIDTH / ((MAX_LNG - MIN_LNG) * KX);
const HEIGHT = (MAX_LAT - MIN_LAT) * SCALE;

function project(lng: number, lat: number): [number, number] {
  return [(lng - MIN_LNG) * KX * SCALE, (MAX_LAT - lat) * SCALE];
}

/** 상태별 마커 모양. 색만으로 구분되지 않도록 하는 보조 부호다(적색약 대응). */
function markerShape(status: Status, r: number) {
  if (status === 'normal') return <circle r={r} />;
  if (status === 'warning') {
    const h = r * 1.5;
    return <polygon points={`0,${-h * 0.62} ${h * 0.58},${h * 0.42} ${-h * 0.58},${h * 0.42}`} />;
  }
  return <rect x={-r * 0.92} y={-r * 0.92} width={r * 1.84} height={r * 1.84} rx="1" />;
}

interface Props {
  schools: School[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  outdoor: Record<RegionId, OutdoorReading> | null;
}

export default function JejuMap({ schools, selectedId, onSelect, outdoor }: Props) {
  const paths = useMemo(
    () =>
      geo.features.map((f) => ({
        name: f.properties.name,
        d: f.geometry.coordinates
          .map(
            (poly) =>
              'M' +
              poly[0]
                .map(([lng, lat]) => project(lng, lat).map((n) => n.toFixed(1)).join(','))
                .join('L') +
              'Z',
          )
          .join(' '),
      })),
    [],
  );

  return (
    <svg
      viewBox={`${-PAD} ${-PAD} ${WIDTH + PAD * 2} ${HEIGHT + PAD * 2}`}
      className="h-full w-full"
      role="img"
      aria-label="제주도 학교 공기질 현황 지도"
    >
      <defs>
        <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="10" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="island">
          {/* 권역 색이 해안선을 넘지 않도록 섬 자체를 클립 경로로 쓴다. */}
          {geo.features.map((f, i) => (
            <path
              key={i}
              d={f.geometry.coordinates
                .map(
                  (poly) =>
                    'M' +
                    poly[0]
                      .map(([lng, lat]) => project(lng, lat).map((n) => n.toFixed(1)).join(','))
                      .join('L') +
                    'Z',
                )
                .join(' ')}
            />
          ))}
        </clipPath>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M50 0H0V50" fill="none" stroke="#161A22" strokeWidth="1" />
        </pattern>
      </defs>

      {/* viewBox는 meet으로 레터박싱되므로, 격자 사각형이 viewBox와 같으면 패널 안에 테두리가 드러난다.
          SVG 루트가 자기 경계로 클립하니 넉넉히 키워 패널 전체를 채운다. */}
      <rect x={-5000} y={-5000} width={10000} height={10000} fill="url(#grid)" />

      {paths.map((p) => (
        <path
          key={p.name}
          d={p.d}
          fill="#171C25"
          stroke="#2B3442"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      ))}

      {/* 4권역 오버레이. 섬 모양으로 클립해 해안선 밖으로 새지 않게 한다.
          색은 실외 미세먼지 등급(파랑→보라) — 실내 상태의 초록/노랑/빨강과 절대 겹치지 않는다. */}
      {outdoor && (
        <g clipPath="url(#island)">
          {REGIONS.map((r) => {
            const g = pm10Grade(outdoor[r.id].pm10);
            const [cx, cy] = project(CENTER.lng, CENTER.lat);
            const R = 1600;
            const pts = [`${cx},${cy}`];
            for (let a = r.from; a <= r.to; a += 6) {
              const rad = (a * Math.PI) / 180;
              pts.push(`${(cx + R * Math.sin(rad)).toFixed(1)},${(cy - R * Math.cos(rad)).toFixed(1)}`);
            }
            return (
              <polygon
                key={r.id}
                points={pts.join(' ')}
                fill={GRADE_COLOR[g]}
                opacity={GRADE_OPACITY[g]}
              />
            );
          })}
        </g>
      )}

      {/* 권역 경계선. 배경 틴트만으로는 4분할이 잘 안 읽혀서 얇게 그어준다. */}
      {outdoor && (
        <g clipPath="url(#island)">
          {[-45, 45, 135, 225].map((a) => {
            const [cx, cy] = project(CENTER.lng, CENTER.lat);
            const rad = (a * Math.PI) / 180;
            const R = 1600;
            return (
              <line
                key={a}
                x1={cx}
                y1={cy}
                x2={cx + R * Math.sin(rad)}
                y2={cy - R * Math.cos(rad)}
                stroke="#4B5768"
                strokeWidth="1"
                strokeDasharray="5 4"
                opacity="0.55"
              />
            );
          })}
        </g>
      )}

      {/* 시 이름 라벨. 마커와 겹치지 않도록 학교가 없는 중산간에 두고, 마커보다 먼저 그려 뒤에 깔리게 한다. */}
      {(
        [
          ['제주시', 126.62, 33.44],
          ['서귀포시', 126.45, 33.32],
        ] as const
      ).map(([name, lng, lat]) => {
        const [x, y] = project(lng, lat);
        return (
          <text
            key={`label-${name}`}
            x={x}
            y={y}
            textAnchor="middle"
            fill="#3C4553"
            fontSize="19"
            letterSpacing="6"
            pointerEvents="none"
          >
            {name}
          </text>
        );
      })}

      {/* 권역 칩. 학교 마커와 겹치지 않는 지점에 하나씩만 띄운다. */}
      {outdoor &&
        REGIONS.map((r) => {
          const o = outdoor[r.id];
          const g = pm10Grade(o.pm10);
          const [x, y] = project(r.chip.lng, r.chip.lat);
          return (
            <g key={`chip-${r.id}`} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`} pointerEvents="none">
              <rect x="-58" y="-30" width="116" height="60" rx="8" fill="#0C1015" opacity="0.88" stroke="#2A323F" />
              <circle cx="-46" cy="-16" r="4" fill={GRADE_COLOR[g]} />
              <text x="-37" y="-12" fill="#E6E8EB" fontSize="13" fontWeight="600">
                {r.name}
              </text>
              <text x="50" y="-12" textAnchor="end" fill={GRADE_COLOR[g]} fontSize="11">
                {g}
              </text>
              <text x="-48" y="6" fill="#79828F" fontSize="10">
                PM10 <tspan fill="#C9CFD8">{o.pm10}</tspan>
              </text>
              <text x="50" y="6" textAnchor="end" fill="#79828F" fontSize="10">
                PM2.5 <tspan fill="#C9CFD8">{o.pm25}</tspan>
              </text>
              <text x="-48" y="22" fill="#79828F" fontSize="10">
                <tspan fill="#C9CFD8">{o.temp}</tspan>℃
              </text>
              <text x="50" y="22" textAnchor="end" fill="#79828F" fontSize="10">
                습도 <tspan fill="#C9CFD8">{o.humidity}</tspan>%
              </text>
            </g>
          );
        })}

      {schools.map((s) => {
        const [x, y] = project(s.lng, s.lat);
        const color = STATUS_COLOR[s.status];
        const selected = s.id === selectedId;
        return (
          <g
            key={s.id}
            transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
            onClick={() => onSelect(s.id)}
            className="cursor-pointer"
          >
            {s.status !== 'normal' && (
              <circle r="22" fill={color} opacity="0.14" filter="url(#glow)">
                <animate
                  attributeName="r"
                  values="16;26;16"
                  dur={s.status === 'critical' ? '1.6s' : '2.6s'}
                  repeatCount="indefinite"
                />
              </circle>
            )}
            {selected && <circle r="16" fill="none" stroke={color} strokeWidth="1.5" opacity="0.8" />}
            <g fill={color} opacity="0.22">{markerShape(s.status, 9)}</g>
            <g fill={color} stroke="#0B0E13" strokeWidth="1.5">{markerShape(s.status, 4.5)}</g>
            <title>{`${s.name} · ${STATUS_LABEL[s.status]}`}</title>
            {selected && (
              <text
                y="-24"
                textAnchor="middle"
                fill="#E6E8EB"
                fontSize="15"
                fontWeight="600"
                style={{ paintOrder: 'stroke', stroke: '#0B0E13', strokeWidth: 4 }}
              >
                {s.name}
              </text>
            )}
          </g>
        );
      })}

    </svg>
  );
}
