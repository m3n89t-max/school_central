'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { School, Status } from '@/lib/types';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/thresholds';

/**
 * 설치 학교 목록 — 상단 메뉴의 드롭다운.
 *
 * 원래 좌측 320px 고정 패널이었다. 지도에 이미 전 학교가 찍히므로
 * 상시 목록은 지도 면적만 잡아먹는다(2026-10-16 대표님 지시).
 * 검색·필터가 필요할 때만 펼치고, 선택하면 바로 닫히며 지도가 해당 학교로 간다.
 */

const FILTERS: Array<{ key: Status | 'all'; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'critical', label: '경고' },
  { key: 'warning', label: '주의' },
  { key: 'normal', label: '정상' },
];

interface Props {
  schools: School[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function SchoolMenu({ schools, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const boxRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭·ESC로 닫는다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schools.filter(
      (s) =>
        (filter === 'all' || s.status === filter) &&
        (!q ||
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.region.toLowerCase().includes(q)),
    );
  }, [schools, query, filter]);

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
          open
            ? 'bg-[#131A21] font-medium text-[#E6E8EB]'
            : 'text-[#79828F] hover:bg-[#161B23] hover:text-[#C9CFD8]'
        }`}
      >
        <span className="text-[11px] opacity-70">▦</span>
        설치 학교
        <span className="font-mono text-[11px] text-[#5F6875]">{schools.length}</span>
        <span className="text-[9px] text-[#5B6472]">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-[360px] overflow-hidden rounded-xl border border-[#232A35] bg-[#0C1015] shadow-2xl">
          <div className="border-b border-[#1B2029] p-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="학교명 · 코드 · 지역 검색"
              className="w-full rounded-lg border border-[#222834] bg-[#12161C] px-3 py-2 text-[13px] text-[#E6E8EB] placeholder:text-[#4E5765] focus:border-[#2DE1E1]/50 focus:outline-none"
            />
            <div className="mt-2.5 flex items-center gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-md px-2.5 py-1 text-[12px] ${
                    filter === f.key
                      ? 'bg-[#2DE1E1] font-medium text-[#062024]'
                      : 'bg-[#161B23] text-[#79828F] hover:text-[#C9CFD8]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-[#5F6875]">{visible.length}개</span>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {visible.map((s) => {
              const color = STATUS_COLOR[s.status];
              const on = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    onSelect(s.id);
                    setOpen(false);
                  }}
                  className={`mb-1 w-full rounded-lg border p-2.5 text-left transition-colors ${
                    on
                      ? 'border-[#2DE1E1]/45 bg-[#131A21]'
                      : 'border-transparent hover:border-[#2A323F] hover:bg-[#11151B]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                    <span className="truncate text-[13px] text-[#C9CFD8]">{s.name}</span>
                    <span className="shrink-0 text-[11px] text-[#5F6875]">{s.region}</span>
                    <span className="ml-auto shrink-0 text-[11px] font-medium" style={{ color }}>
                      {STATUS_LABEL[s.status]}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 pl-4">
                    {s.zones.map((z) => (
                      <span
                        key={z.id}
                        className="flex items-center gap-1 rounded bg-[#0F131A] px-1.5 py-0.5 text-[10px] text-[#79828F]"
                      >
                        <i
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: STATUS_COLOR[z.status] }}
                        />
                        {z.kind}
                        <span className="font-mono text-[#C9CFD8]">{z.reading.pm25}</span>
                      </span>
                    ))}
                    <span className="ml-auto rounded border border-[#F5A623]/35 px-1 text-[9px] text-[#F5A623]">
                      목업
                    </span>
                  </div>
                </button>
              );
            })}
            {visible.length === 0 && (
              <p className="px-2 py-8 text-center text-[13px] text-[#4E5765]">
                조건에 맞는 학교가 없습니다.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
