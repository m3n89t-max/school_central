'use client';

import { useMemo, useState } from 'react';
import type { School, Status } from '@/lib/types';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/thresholds';

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

export default function SchoolList({ schools, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Status | 'all'>('all');

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
    <section className="flex w-[320px] shrink-0 flex-col border-r border-[#1B2029] bg-[#0E1116]">
      <header className="flex items-center justify-between px-4 pb-3 pt-5">
        <h2 className="text-[15px] font-semibold text-[#E6E8EB]">설치 학교</h2>
        <span className="text-[12px] text-[#5F6875]">{visible.length}개</span>
      </header>

      <div className="px-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="학교명 · 코드 · 지역 검색"
          className="w-full rounded-lg border border-[#222834] bg-[#12161C] px-3 py-2 text-[13px] text-[#E6E8EB] placeholder:text-[#4E5765] focus:border-[#2DE1E1]/50 focus:outline-none"
        />
        <div className="mt-3 flex gap-1.5">
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
        </div>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto px-3 pb-3">
        {visible.map((s) => {
          const color = STATUS_COLOR[s.status];
          const on = s.id === selectedId;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`mb-1.5 w-full rounded-xl border p-3 text-left transition-colors ${
                on
                  ? 'border-[#2DE1E1]/45 bg-[#131A21]'
                  : 'border-[#1B2029] bg-[#11151B] hover:border-[#2A323F]'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[13px] tracking-[0.14em] text-[#E6E8EB]">{s.id}</span>
                <span className="text-[11px] font-medium" style={{ color }}>
                  {STATUS_LABEL[s.status]}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[12px] text-[#8A929E]">
                <span className="text-[#C9CFD8]">{s.name}</span>
                <span className="text-[#3E4653]">·</span>
                <span>{s.region}</span>
                {/* 실명 학교라 측정값이 진짜로 읽힐 위험이 크다. 카드마다 표시한다. */}
                <span className="ml-auto rounded border border-[#F5A623]/35 px-1 text-[10px] text-[#F5A623]">
                  목업
                </span>
              </div>
              <div className="mt-2.5 flex gap-1.5">
                {s.zones.map((z) => (
                  <span
                    key={z.id}
                    className="flex items-center gap-1.5 rounded-md bg-[#0C1015] px-2 py-1 text-[11px] text-[#79828F]"
                  >
                    <i
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: STATUS_COLOR[z.status] }}
                    />
                    {z.kind}
                    <span className="text-[#4E5765]">PM2.5</span>
                    <span className="font-mono text-[#C9CFD8]">{z.reading.pm25}</span>
                  </span>
                ))}
              </div>
            </button>
          );
        })}
        {visible.length === 0 && (
          <p className="px-2 py-8 text-center text-[13px] text-[#4E5765]">조건에 맞는 학교가 없습니다.</p>
        )}
      </div>
    </section>
  );
}
