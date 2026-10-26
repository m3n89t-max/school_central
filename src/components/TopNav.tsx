'use client';

import { STATUS_COLOR, STATUS_LABEL } from '@/lib/thresholds';
import SchoolMenu from './SchoolMenu';
import type { School, Status } from '@/lib/types';

/**
 * 상단 가로 네비게이션.
 *
 * 기존 좌측 사이드바(228px)를 가로 바로 돌렸다(2026-10-16 대표님 지시).
 * 세로 폭을 되찾아야 지도와 팝업 격자가 커진다 — 관제실 벽면 모니터에서
 * 멀리 떨어져 보는 화면이라 세로 공간이 곧 가독성이다.
 *
 * 2026-10-26 대표님 지시로 메뉴를 실제 기능에 연결했다.
 * "헤더의 메뉴가 목업같은데 활성화 해서 기능을 넣어"
 *
 * 전에는 9개 중 '관제 지도'(표시만)와 '이력'(패널 열기) 둘뿐이 동작하지
 * 않았다. 나머지 7개는 눌러도 아무 일이 없어, 교육청 시연에서 눌리면
 * 바로 들통나는 자리였다.
 *
 * 각 항목은 ViewId를 갖고, 누르면 부모(page.tsx)가 해당 패널을 연다.
 * '관제 지도'는 패널이 아니라 바탕 화면이므로 열린 패널을 닫는 역할이다.
 */
export type ViewId =
  | 'map'
  | 'overview'
  | 'alerts'
  | 'zones'
  | 'outdoor'
  | 'floorplan'
  | 'notify'
  | 'history'
  | 'report';

const NAV: { id: ViewId; label: string; icon: string }[] = [
  { id: 'overview', label: '개요', icon: '▤' },
  { id: 'map', label: '관제 지도', icon: '◈' },
  { id: 'alerts', label: '경고 학교', icon: '▲' },
  { id: 'zones', label: '구역별 현황', icon: '▦' },
  { id: 'outdoor', label: '실외 대기질', icon: '◍' },
  { id: 'floorplan', label: '조리실 도면', icon: '◰' },
  { id: 'notify', label: '알림', icon: '◔' },
  { id: 'history', label: '이력', icon: '◷' },
  { id: 'report', label: '보고서', icon: '◫' },
];

interface Props {
  siteCount: number;
  counts: Record<Status, number>;
  updatedAt: string | null;
  /** 현재 열려 있는 화면. 'map'이면 바탕 지도만 보이는 상태다. */
  view: ViewId;
  /** 메뉴 클릭 — 부모가 해당 패널을 연다. */
  onNavigate: (v: ViewId) => void;
  /** 설치 학교 드롭다운에 넘길 목록. */
  schools: School[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function TopNav({
  siteCount,
  counts,
  updatedAt,
  view,
  onNavigate,
  schools,
  selectedId,
  onSelect,
}: Props) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-5 border-b border-[#E2E6EC] bg-white px-5">
      <div className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-[15px] font-bold tracking-[0.18em] text-[#1C2430]">VAQ</span>
        <span className="text-[15px] font-bold tracking-[0.18em] text-[#0E8F8F]">CENTRAL</span>
      </div>

      <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {/* 설치 학교는 드롭다운이라 별도 컴포넌트로 둔다. */}
        <SchoolMenu schools={schools} selectedId={selectedId} onSelect={onSelect} />
        {NAV.map((item) => {
          const on = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={on ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                on
                  ? 'bg-[#EAF7F7] font-semibold text-[#0D3B3B] shadow-[inset_0_-2px_0_#0E8F8F]'
                  : 'text-[#5A6473] hover:bg-[#F1F4F8] hover:text-[#1C2430]'
              }`}
            >
              <span className="text-[11px] opacity-70">{item.icon}</span>
              {item.label}
              {item.id === 'map' && (
                <span className={`font-mono text-[11px] ${on ? 'text-[#4E7C7C]' : 'text-[#9AA4B2]'}`}>
                  {siteCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 상태 집계 — 벽면 모니터에서 읽히도록 숫자를 키웠다. */}
      <div className="flex shrink-0 items-center gap-3.5">
        {(['critical', 'warning', 'normal'] as Status[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[12px] text-[#5A6473]">
            <i className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
            {STATUS_LABEL[s]}
            <b className="font-mono text-[17px] font-bold leading-none text-[#1C2430]">
              {counts[s]}
            </b>
          </span>
        ))}
        <span className="border-l border-[#E2E6EC] pl-3.5 font-mono text-[12px] text-[#6B7585]">
          {updatedAt ?? '--:--:--'}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button className="rounded-lg bg-[#0E8F8F] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0B7A7A]">
          신규 학교 등록
        </button>
        <button className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 hover:bg-[#F1F4F8]">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0E8F8F]/12 text-[11px] text-[#0E8F8F]">
            새
          </span>
          <span className="text-[10px] text-[#8A929E]">▾</span>
        </button>
      </div>
    </header>
  );
}
