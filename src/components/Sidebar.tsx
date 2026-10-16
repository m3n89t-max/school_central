'use client';

/** 좌측 네비게이션. 1차 범위는 지도 대시보드 한 화면이라 '관제 지도'만 동작한다. */
const NAV: Array<{ label: string; icon: string; active?: boolean; children?: string[] }> = [
  { label: '개요', icon: '▤' },
  {
    label: '모니터링',
    icon: '◈',
    active: true,
    children: ['관제 지도', '경고 학교', '구역별 현황', '실외 대기질', '조리실 도면'],
  },
  { label: '알림', icon: '◔' },
  { label: '이력', icon: '◷' },
  { label: '보고서', icon: '◫' },
];

const FOOT = [
  { label: '설정', icon: '⚙' },
  { label: '지원', icon: '◎' },
  { label: '로그아웃', icon: '⇥' },
];

export default function Sidebar({ siteCount }: { siteCount: number }) {
  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r border-[#1B2029] bg-[#0E1116]">
      <div className="px-5 pb-5 pt-6">
        <div className="text-[15px] font-bold leading-[1.15] tracking-[0.18em] text-[#E6E8EB]">
          VAQ
          <br />
          <span className="text-[#2DE1E1]">CENTRAL</span>
        </div>
      </div>

      <button className="mx-3 flex items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-[#161B23]">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-[#2DE1E1]/15 text-[11px] text-[#2DE1E1]">
          새
        </span>
        <span className="flex-1 truncate text-[13px] text-[#C9CFD8]">새론환기시스템</span>
        <span className="text-[10px] text-[#5B6472]">▾</span>
      </button>

      <nav className="mt-4 flex-1 overflow-y-auto px-3">
        {NAV.map((item) => (
          <div key={item.label} className="mb-0.5">
            <div
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] ${
                item.active ? 'text-[#E6E8EB]' : 'text-[#79828F] hover:bg-[#161B23]'
              }`}
            >
              <span className="w-3.5 text-center text-[11px] opacity-70">{item.icon}</span>
              {item.label}
            </div>
            {item.children?.map((c, i) => {
              const on = i === 0;
              return (
                <div
                  key={c}
                  className={`ml-[26px] flex items-center justify-between rounded-lg py-1.5 pl-3 pr-2 text-[13px] ${
                    on
                      ? 'border-l border-[#2DE1E1] bg-[#131A21] font-medium text-[#E6E8EB]'
                      : 'border-l border-[#1B2029] text-[#5F6875]'
                  }`}
                >
                  {c}
                  {on && <span className="text-[11px] text-[#5F6875]">{siteCount}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-3 pb-3">
        <button className="mb-4 w-full rounded-lg bg-[#2DE1E1] py-2.5 text-[13px] font-semibold text-[#062024] hover:bg-[#4BE9E9]">
          신규 학교 등록
        </button>
        {FOOT.map((f) => (
          <div
            key={f.label}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-[#79828F] hover:bg-[#161B23]"
          >
            <span className="w-3.5 text-center text-[11px] opacity-70">{f.icon}</span>
            {f.label}
          </div>
        ))}
      </div>
    </aside>
  );
}
