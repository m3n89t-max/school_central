'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import SchoolList from '@/components/SchoolList';
import JejuMap from '@/components/JejuMap';
import KakaoMap from '@/components/KakaoMap';
import DetailPanel from '@/components/DetailPanel';
import DiagnosticMatrix from '@/components/DiagnosticMatrix';
import { SITE_COUNT, buildSchools, countByStatus } from '@/lib/mock';
import { buildOutdoor } from '@/lib/outdoor';
import { buildDiagnoses } from '@/lib/diagnosis';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/thresholds';
import type { Status } from '@/lib/types';

/** CLAUDE.md 1. 개요 — 실시간 갱신 주기 5초. */
const REFRESH_MS = 5000;

export default function Page() {
  const [tick, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOutdoor, setShowOutdoor] = useState(true);
  const [showMatrix, setShowMatrix] = useState(false);
  const [source, setSource] = useState<'vector' | 'kakao'>('kakao');
  // 카카오맵은 원래 화면이 기본. 다크 보정은 필요할 때만 켠다.
  const [mapDark, setMapDark] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = () => {
      const d = new Date();
      setUpdatedAt(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    stamp();
    const id = setInterval(() => {
      setTick((t) => t + 1);
      stamp();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const schools = useMemo(() => buildSchools(tick), [tick]);
  const counts = useMemo(() => countByStatus(schools), [schools]);
  const outdoor = useMemo(() => buildOutdoor(tick), [tick]);
  const diagnoses = useMemo(() => buildDiagnoses(schools), [schools]);
  const selected = schools.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#090B0F] text-[#E6E8EB]">
      <Sidebar siteCount={SITE_COUNT} />
      <SchoolList schools={schools} selectedId={selectedId} onSelect={setSelectedId} />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[#1B2029] px-5 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-[15px] font-semibold">제주 조리실 공기질 관제</h1>
            <span className="rounded-md border border-[#F5A623]/35 bg-[#F5A623]/10 px-2 py-0.5 text-[11px] font-medium text-[#F5A623]">
              학교명·위치 실제 · 측정값은 목업
            </span>
          </div>
          <div className="flex items-center gap-4">
            {(['critical', 'warning', 'normal'] as Status[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-[12px] text-[#8A929E]">
                <i className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                {STATUS_LABEL[s]}
                <b className="font-mono font-semibold text-[#E6E8EB]">{counts[s]}</b>
              </span>
            ))}
            <span className="ml-2 border-l border-[#1B2029] pl-4 font-mono text-[12px] text-[#5F6875]">
              {updatedAt ?? '--:--:--'}
            </span>
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          {source === 'vector' ? (
            <JejuMap
              schools={schools}
              selectedId={selectedId}
              onSelect={setSelectedId}
              outdoor={showOutdoor ? outdoor : null}
            />
          ) : (
            <KakaoMap
              schools={schools}
              selectedId={selectedId}
              onSelect={setSelectedId}
              dark={mapDark}
              outdoor={showOutdoor ? outdoor : null}
            />
          )}

          <div className="absolute right-4 top-4 z-20 flex gap-1.5">
            <div className="flex overflow-hidden rounded-lg border border-[#232A35] bg-[#0C1015]/90">
              {(['vector', 'kakao'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSource(k)}
                  aria-pressed={source === k}
                  className={`px-2.5 py-1.5 text-[12px] transition-colors ${
                    source === k ? 'bg-[#132027] text-[#2DE1E1]' : 'text-[#79828F] hover:text-[#C9CFD8]'
                  }`}
                >
                  {k === 'vector' ? '벡터맵' : '카카오맵'}
                </button>
              ))}
            </div>
            {[
              ...(source === 'kakao'
                ? [{ on: mapDark, set: setMapDark, label: '다크' }]
                : []),
              { on: showOutdoor, set: setShowOutdoor, label: '실외 대기질' },
              { on: showMatrix, set: setShowMatrix, label: '진단' },
            ].map((b) => (
                <button
                  key={b.label}
                  onClick={() => b.set((v) => !v)}
                  aria-pressed={b.on}
                  className={`rounded-lg border px-2.5 py-1.5 text-[12px] backdrop-blur transition-colors ${
                    b.on
                      ? 'border-[#2DE1E1]/45 bg-[#132027] text-[#2DE1E1]'
                      : 'border-[#232A35] bg-[#0C1015]/90 text-[#79828F] hover:text-[#C9CFD8]'
                  }`}
                >
                  {b.label}
                </button>
            ))}
          </div>

          {selected && <DetailPanel school={selected} onClose={() => setSelectedId(null)} />}
          {showMatrix && (
            <DiagnosticMatrix
              schools={schools}
              diagnoses={diagnoses}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onClose={() => setShowMatrix(false)}
            />
          )}
          <p className="absolute bottom-3 left-5 text-[11px] text-[#3E4653]">
            {REFRESH_MS / 1000}초 간격 갱신 · 학교명·좌표는 실제, 공기질 측정값과 진단은 목업
          </p>
        </div>
      </main>
    </div>
  );
}
