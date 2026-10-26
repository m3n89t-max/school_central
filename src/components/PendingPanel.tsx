'use client';

import PanelShell from './PanelShell';

/**
 * 아직 만들지 않은 화면에 대한 안내.
 *
 * 왜 '준비 중' 화면을 따로 만드나
 * -------------------------------
 * 2026-10-26 대표님 지시로 헤더 메뉴를 전부 눌리게 바꿨다. 그런데 9개
 * 중 일부는 외부에서 받아야 할 자료가 없어 지금 만들 수 없다. 조리실
 * 도면이 대표적이다. 학교별 실제 평면도와 센서 설치 좌표가 있어야
 * 하는데, 그건 새론이 현장에서 확보해 넘겨줘야 하는 자료다.
 *
 * 선택지는 셋이었다.
 *   1) 메뉴를 숨긴다 → 교육청에 보여줄 전체 그림이 사라진다
 *   2) 그럴듯한 가짜 도면을 그린다 → 실제인 것처럼 읽혀 가장 위험하다
 *   3) 자리는 두되 무엇이 없어 못 만드는지 밝힌다
 *
 * 3번을 골랐다. 교육청 시연에서 "이건 왜 비어 있냐"는 질문에 "이러이러한
 * 자료를 받으면 채워진다"고 답할 수 있어야 한다. 빈 화면보다 낫고,
 * 가짜 도면보다 훨씬 안전하다.
 */
interface Props {
  title: string;
  /** 이 화면이 무엇을 보여줄 것인지. */
  purpose: string;
  /** 지금 못 만드는 이유 — 무엇이 없는지 구체적으로. */
  blockers: string[];
  /** 누가 무엇을 주면 만들 수 있는지. */
  unblock: string;
  onClose: () => void;
}

export default function PendingPanel({ title, purpose, blockers, unblock, onClose }: Props) {
  return (
    <PanelShell title={title} subtitle="준비 중 — 외부 자료 대기" onClose={onClose}>
      <div className="mx-auto max-w-[720px] space-y-6 py-4">
        <div className="rounded-xl border border-dashed border-[#F5A623] bg-[#FFF8EC] px-5 py-4">
          <div className="mb-1.5 text-[13px] font-bold tracking-wide text-[#B2740A]">
            아직 만들지 않은 화면입니다
          </div>
          <p className="text-[15px] leading-relaxed text-[#5A4A2A]">
            이 자리에 넣을 자료가 아직 확보되지 않았습니다. 없는 내용을 임의로 그리면 실제
            측정값처럼 읽힐 수 있어, 비워 두고 사유를 밝힙니다.
          </p>
        </div>

        <section>
          <h3 className="mb-2 text-[13px] font-bold tracking-wide text-[#5A6473]">
            이 화면이 보여줄 것
          </h3>
          <p className="text-[16px] leading-relaxed text-[#1C2430]">{purpose}</p>
        </section>

        <section>
          <h3 className="mb-2 text-[13px] font-bold tracking-wide text-[#5A6473]">
            지금 없는 것
          </h3>
          <ul className="space-y-2">
            {blockers.map((b) => (
              <li key={b} className="flex gap-2.5 text-[16px] leading-relaxed text-[#1C2430]">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#F5A623]" />
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-[#E2E6EC] bg-[#F7F9FC] px-5 py-4">
          <h3 className="mb-2 text-[13px] font-bold tracking-wide text-[#0E8F8F]">
            채우려면
          </h3>
          <p className="text-[16px] leading-relaxed text-[#1C2430]">{unblock}</p>
        </section>
      </div>
    </PanelShell>
  );
}
