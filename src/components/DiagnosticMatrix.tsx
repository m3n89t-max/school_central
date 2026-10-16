'use client';

import { useState } from 'react';
import type { School } from '@/lib/types';
import { STATUS_COLOR } from '@/lib/thresholds';
import { AIRFLOW_LOW, CORR_HIGH, type SchoolDiagnosis } from '@/lib/diagnosis';

/**
 * 유지보수 진단 매트릭스 — 풍속 × 실외상관 사분면 산점도.
 * 위치가 곧 진단이므로 색은 심각도를 보강할 뿐, 단독 부호가 아니다.
 */

const W = 300;
const H = 210;
// 축 범위. 데이터가 몰린 구간만 보여주되 경계선이 가운데 오도록 잡았다.
const X0 = 0, X1 = 1; // 상관
const Y0 = 0.3, Y1 = 1.15; // 풍속비

const px = (c: number) => ((c - X0) / (X1 - X0)) * W;
const py = (a: number) => H - ((a - Y0) / (Y1 - Y0)) * H;

const CX = px(CORR_HIGH);
const CY = py(AIRFLOW_LOW);

const QUADRANTS = [
  { x: 4, y: 14, anchor: 'start' as const, text: '정상' },
  { x: W - 4, y: 14, anchor: 'end' as const, text: '필터 파손·누기' },
  { x: 4, y: H - 6, anchor: 'start' as const, text: '필터 막힘 → 교체' },
  { x: W - 4, y: H - 6, anchor: 'end' as const, text: '급기 정지·외기 침입' },
];

interface Props {
  schools: School[];
  diagnoses: SchoolDiagnosis[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export default function DiagnosticMatrix({ schools, diagnoses, selectedId, onSelect, onClose }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const byId = new Map(schools.map((s) => [s.id, s]));
  const active = hover ?? selectedId;
  const activeRow = diagnoses.find((d) => d.schoolId === active);

  return (
    <div className="pointer-events-auto absolute bottom-4 left-4 z-10 w-[364px] rounded-2xl border border-[#232A35] bg-[#0C1015]/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-[#E6E8EB]">유지보수 진단</h3>
          <p className="mt-0.5 text-[11px] text-[#79828F]">
            급기 풍속 × 실외 미세먼지 상관
          </p>
          <p className="mt-0.5 text-[10px] text-[#F5A623]">
            목업 — 풍속센서는 Phase 2에 설치 예정
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="닫기"
          className="rounded-md px-1.5 text-[15px] leading-none text-[#5F6875] hover:text-[#C9CFD8]"
        >
          ✕
        </button>
      </div>

      <svg viewBox={`-52 -18 ${W + 64} ${H + 46}`} className="w-full" role="img" aria-label="진단 매트릭스">
        <rect x="0" y="0" width={W} height={H} fill="#0F131A" stroke="#1B2029" />

        {/* 사분면 경계 */}
        <line x1={CX} y1="0" x2={CX} y2={H} stroke="#2A323F" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="0" y1={CY} x2={W} y2={CY} stroke="#2A323F" strokeWidth="1" strokeDasharray="3 3" />

        {QUADRANTS.map((q) => (
          <text key={q.text} x={q.x} y={q.y} textAnchor={q.anchor} fill="#4E5765" fontSize="9">
            {q.text}
          </text>
        ))}

        {/* 축 */}
        <text x={W / 2} y={H + 22} textAnchor="middle" fill="#79828F" fontSize="10">
          실외 상관 →
        </text>
        <text x={-42} y={H / 2} textAnchor="middle" fill="#79828F" fontSize="10" transform={`rotate(-90 -42 ${H / 2})`}>
          급기 풍속비 →
        </text>
        <text x={-6} y={py(1.0) + 3} textAnchor="end" fill="#4E5765" fontSize="9">100%</text>
        <text x={-6} y={CY + 3} textAnchor="end" fill="#4E5765" fontSize="9">75%</text>
        <text x={-6} y={py(0.4) + 3} textAnchor="end" fill="#4E5765" fontSize="9">40%</text>
        <text x={CX} y={H + 11} textAnchor="middle" fill="#4E5765" fontSize="9">0.5</text>

        {diagnoses.map((d) => {
          const s = byId.get(d.schoolId);
          if (!s) return null;
          const x = px(d.correlation);
          const y = py(d.airflow);
          const color = STATUS_COLOR[d.diagnosis.status];
          const on = d.schoolId === active;
          const named = d.diagnosis.id !== 'ok';
          return (
            <g
              key={d.schoolId}
              onClick={() => onSelect(d.schoolId)}
              onMouseEnter={() => setHover(d.schoolId)}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer"
            >
              {/* 히트 영역을 마크보다 크게 */}
              <circle cx={x} cy={y} r="12" fill="transparent" />
              {on && <circle cx={x} cy={y} r="10" fill="none" stroke={color} strokeWidth="1.5" />}
              <circle cx={x} cy={y} r="5" fill={color} stroke="#0C1015" strokeWidth="2" />
              {/* 정상은 라벨을 달지 않는다 — 조치가 필요한 학교만 직접 표기 */}
              {named && !on && (
                <text x={x} y={y - 10} textAnchor="middle" fill="#8A929E" fontSize="9">
                  {d.schoolId}
                </text>
              )}
              <title>{`${s.name} · ${d.diagnosis.label}`}</title>
            </g>
          );
        })}
      </svg>

      <div className="mt-1 min-h-[34px] rounded-lg bg-[#0F131A] px-2.5 py-1.5">
        {activeRow ? (
          <>
            <div className="flex items-center gap-1.5 text-[12px]">
              <i
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: STATUS_COLOR[activeRow.diagnosis.status] }}
              />
              <span className="text-[#C9CFD8]">{byId.get(activeRow.schoolId)?.name}</span>
              <span className="text-[#3E4653]">·</span>
              <span className="font-medium text-[#E6E8EB]">{activeRow.diagnosis.label}</span>
              <span className="ml-auto font-mono text-[11px] text-[#5F6875]">
                {Math.round(activeRow.airflow * 100)}% / {activeRow.correlation.toFixed(2)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-[#79828F]">{activeRow.diagnosis.detail}</p>
          </>
        ) : (
          <p className="text-[11px] leading-[22px] text-[#4E5765]">
            점 위에 올리면 진단 내용이 표시됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
