'use client';

import type { School, Zone } from '@/lib/types';
import {
  GRADE_COLOR,
  GRADE_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  gradeBlinks,
  metricGrade,
  readingGrade,
  referenceGrade,
} from '@/lib/thresholds';
import type { JudgedMetric, ReferenceMetric } from '@/lib/thresholds';

/**
 * 표시 순서는 실제 VAQ 측정 항목 순서를 따른다.
 * 온도·습도는 기준표에 없다 — 참고 색만 입히고 '참고'로 표시하며
 * 학교 상태(정상/주의/경고) 판정에는 쓰지 않는다.
 * 단위는 조리실공기질기준표 기준 — VOC는 ppb다(㎍/㎥ 아님).
 */
const METRICS = [
  { key: 'pm25', label: '초미세먼지', unit: '㎍/㎥', judged: true },
  { key: 'pm10', label: '미세먼지', unit: '㎍/㎥', judged: true },
  { key: 'co2', label: '이산화탄소', unit: 'ppm', judged: true },
  { key: 'co', label: '일산화탄소', unit: 'ppm', judged: true, decimals: 1 },
  { key: 'hcho', label: '포름알데히드', unit: '㎍/㎥', judged: true },
  { key: 'temp', label: '온도', unit: '℃', judged: false, decimals: 1 },
  { key: 'humidity', label: '습도', unit: '%RH', judged: false },
  { key: 'voc', label: 'VOC', unit: 'ppb', judged: true },
] as const;

function ZoneCard({ zone }: { zone: Zone }) {
  // 구역 종합 등급은 기준표 5단계로 보여준다. 지도 3단계는 축약본이다.
  const zoneGrade = readingGrade(zone.reading);
  return (
    <div className="rounded-xl border border-[#1B2029] bg-[#0F131A] p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[13px] font-medium text-[#E6E8EB]">
          <i
            className={`h-2 w-2 rounded-full${gradeBlinks(zoneGrade) ? ' vaq-blink' : ''}`}
            style={{ background: GRADE_COLOR[zoneGrade] }}
          />
          {zone.kind}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium">
          <span style={{ color: GRADE_COLOR[zoneGrade] }}>{GRADE_LABEL[zoneGrade]}</span>
          <span className="text-[#4E5765]">·</span>
          <span style={{ color: STATUS_COLOR[zone.status] }}>{STATUS_LABEL[zone.status]}</span>
        </span>
      </div>
      <dl className="space-y-1">
        {METRICS.map((m) => {
          const value = zone.reading[m.key];
          // 판정 대상은 기준표 등급, 온습도는 참고 등급. 둘을 섞어 쓰지 않는다.
          const grade = m.judged
            ? metricGrade(m.key as JudgedMetric, value)
            : referenceGrade(m.key as ReferenceMetric, value);
          const color = GRADE_COLOR[grade];
          return (
            <div key={m.key} className="flex items-baseline justify-between">
              <dt className="text-[12px] text-[#79828F]">
                {m.label}
                {grade !== 'veryGood' && (
                  <span className="ml-1.5 text-[10px]" style={{ color }}>
                    {GRADE_LABEL[grade]}
                  </span>
                )}
                {!m.judged && (
                  <span className="ml-1 text-[9px] text-[#F5A623]">참고</span>
                )}
              </dt>
              <dd
                className={`font-mono text-[13px]${
                  m.judged && gradeBlinks(grade) ? ' vaq-blink' : ''
                }`}
                style={{ color }}
              >
                {'decimals' in m ? value.toFixed(m.decimals) : value}
                <span className="ml-1 text-[10px] text-[#5F6875]">{m.unit}</span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export default function DetailPanel({ school, onClose }: { school: School; onClose: () => void }) {
  return (
    <div className="pointer-events-auto absolute right-4 top-[54px] z-10 w-[268px] rounded-2xl border border-[#232A35] bg-[#0C1015]/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <div className="font-mono text-[12px] tracking-[0.14em] text-[#5F6875]">{school.id}</div>
          <h3 className="mt-0.5 text-[15px] font-semibold text-[#E6E8EB]">{school.name}</h3>
          <p className="mt-0.5 text-[12px] text-[#79828F]">
            {school.city} {school.region}
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
      <div className="mb-2.5 rounded-lg border border-[#F5A623]/30 bg-[#F5A623]/8 px-2.5 py-1.5">
        <p className="text-[11px] leading-relaxed text-[#F5A623]">
          아래 수치는 <b>목업</b>입니다. 학교명·위치만 실제이고 측정값은 실측이 아닙니다.
        </p>
      </div>
      <div className="space-y-2">
        {school.zones.map((z) => (
          <ZoneCard key={z.id} zone={z} />
        ))}
      </div>
    </div>
  );
}
