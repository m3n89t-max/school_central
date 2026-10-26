'use client';

import type { ReactNode } from 'react';

/**
 * 헤더 메뉴로 여는 전체 화면 패널의 공용 틀.
 *
 * 왜 공용 틀을 두나
 * -----------------
 * 헤더 메뉴 9개를 각각 다른 사람이 채우면 제목 위치·닫기 버튼·여백이
 * 전부 달라진다. 관제 화면에서 화면마다 닫는 법이 다르면 조작이 막힌다.
 * 바깥 틀은 여기 한 곳에서만 정하고, 각 패널은 내용만 채운다.
 *
 * 색은 흰 바탕이다. 2026-10-26 대표님 지시로 헤더를 화이트톤으로 바꿨고,
 * 새로 만드는 화면은 그 방향을 따른다. 기존 어두운 패널(이력·상세·진단)은
 * 아직 그대로이며, 별도 승인 후 함께 맞춘다.
 *
 * Esc로도 닫힌다. 벽면 모니터 앞에서 마우스를 멀리 두고 보는 경우가 많아
 * 키보드 한 번으로 빠져나올 길을 둔다.
 */
interface Props {
  title: string;
  /** 제목 옆 보조 설명. 집계 수치나 기준일을 넣는다. */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** 표가 넓은 화면(구역별 현황 등)은 true. 기본은 1100px. */
  wide?: boolean;
}

export default function PanelShell({ title, subtitle, onClose, children, wide }: Props) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-[#0B1017]/55 p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-[#D9DFE7] bg-white shadow-2xl ${
          wide ? 'max-w-[1480px]' : 'max-w-[1100px]'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#E2E6EC] px-6 py-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[20px] font-bold text-[#1C2430]">{title}</h2>
            {subtitle && <span className="text-[13px] text-[#5A6473]">{subtitle}</span>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-[#D9DFE7] px-3.5 py-2 text-[13px] font-medium text-[#5A6473] transition-colors hover:bg-[#F1F4F8] hover:text-[#1C2430]"
          >
            닫기 (Esc)
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
