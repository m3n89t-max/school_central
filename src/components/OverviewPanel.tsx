'use client';

import { useMemo } from 'react';
import PanelShell from './PanelShell';
import type { School, Status, Zone } from '@/lib/types';
import type { Alarm } from '@/lib/alarm';
import { elapsedLabel } from '@/lib/alarm';
import {
  GRADE_COLOR,
  GRADE_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  metricGrade,
  readingGrade,
  worst,
  worstGrade,
} from '@/lib/thresholds';
import type { Grade, JudgedMetric } from '@/lib/thresholds';

/**
 * 개요 패널 — 교육청 관제실 50인치 TV용 한 장 요약.
 *
 * 무인 화면이다. 사람이 클릭해서 파고들지 않는다는 전제로,
 * "지금 어디가 몇 군데 나쁜가"를 멀리서 읽히는 크기로만 담는다.
 *
 * 담는 것은 네 덩이다.
 *   1. 상태별 학교 수(큰 숫자)
 *   2. 지금 경보 중인 학교(행 클릭 → 상세)
 *   3. 항목별 전교 '나쁨 이상' 구역 수(가로 막대)
 *   4. 읍면동별 학교 수와 최악 상태
 *
 * 온도·습도는 **의도적으로 빼 두었다.** 기준표(thresholds.ts 주석)에 법정
 * 구간이 없어 판정에 쓸 수 없고, 참고값을 이 화면에 섞으면 관제자가
 * 판정 항목으로 오해한다. 참고 표시는 상세 패널에서만 한다.
 *
 * 모든 수치는 props(schools·counts·alarms·now)와 lib 함수로만 계산한다.
 * 추이·예측은 만들지 않는다 — 이 화면은 현재 시점만 본다.
 */

/**
 * 판정 6항목. 기준표(GRADE_THRESHOLDS)에 구간이 있는 항목과 1:1로 맞춘다.
 * 단위는 기준표 기준(PM·HCHO = ㎍/㎥, CO₂·CO = ppm, VOC = ppb).
 */
const METRICS: Array<{ key: JudgedMetric; label: string; unit: string }> = [
  { key: 'pm10', label: 'PM10', unit: '㎍/㎥' },
  { key: 'pm25', label: 'PM2.5', unit: '㎍/㎥' },
  { key: 'co2', label: 'CO₂', unit: 'ppm' },
  { key: 'voc', label: 'VOC', unit: 'ppb' },
  { key: 'hcho', label: 'HCHO', unit: '㎍/㎥' },
  { key: 'co', label: 'CO', unit: 'ppm' },
];

/** 경보·집계 기준. 기준표에서 빨강(240.0.0)이 시작되는 '나쁨'부터다(lib/alarm.ts와 동일). */
function isBad(g: Grade): boolean {
  return g === 'bad' || g === 'veryBad';
}

/** CO만 소수 1자리로 들어온다(mock.ts의 toFixed(1)). 표에서 자릿수를 맞춘다. */
function fmt(key: JudgedMetric, v: number): string {
  return key === 'co' ? v.toFixed(1) : String(v);
}

interface MetricHit {
  key: JudgedMetric;
  label: string;
  unit: string;
  value: number;
  grade: Grade;
}

/** 한 구역에서 가장 나쁜 판정 항목. 같은 등급이면 METRICS 순서를 따른다. */
function worstMetricOf(zone: Zone): MetricHit {
  const scored: MetricHit[] = METRICS.map((m) => ({
    ...m,
    value: zone.reading[m.key],
    grade: metricGrade(m.key, zone.reading[m.key]),
  }));
  const top = worstGrade(scored.map((s) => s.grade));
  return scored.find((s) => s.grade === top) ?? scored[0];
}

/** 상태 배지 — 색 + 등급명을 항상 같이 낸다(적색약 대응). */
function StatusChip({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <i
        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/15"
        style={{ background: STATUS_COLOR[status] }}
      />
      <span className="text-[15px] font-semibold text-[#1C2430]">{STATUS_LABEL[status]}</span>
    </span>
  );
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <h3 className="text-[19px] font-bold text-[#1C2430]">{title}</h3>
      {note && <span className="text-[14px] text-[#5A6473]">{note}</span>}
    </div>
  );
}

interface Props {
  schools: School[];
  counts: Record<Status, number>;
  alarms: Alarm[];
  now: number;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export default function OverviewPanel({
  schools,
  counts,
  alarms,
  now,
  onClose,
  onSelect,
}: Props) {
  /** 학교 id → School. 경보 행에서 학교명·구역을 끌어오는 데 쓴다. */
  const schoolById = useMemo(() => {
    const m = new Map<string, School>();
    for (const s of schools) m.set(s.id, s);
    return m;
  }, [schools]);

  const allZones = useMemo(() => schools.flatMap((s) => s.zones), [schools]);

  /**
   * 2. 경보 중인 학교 행.
   * alarms가 정본이다(승격·해제 판정은 lib/alarm.ts). 여기서는 표시만 한다.
   */
  const alarmRows = useMemo(() => {
    return alarms
      .map((a) => {
        const school = schoolById.get(a.schoolId);
        if (!school) return null;
        // 경보 등급을 만든 구역을 대표로 쓴다(AlarmGrid와 같은 규칙).
        const zone =
          school.zones.find((z) => readingGrade(z.reading) === a.grade) ?? school.zones[0];
        return { alarm: a, school, zone, hit: worstMetricOf(zone) };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [alarms, schoolById]);

  /**
   * 3. 항목별 전교 현황.
   * 전체 구역을 돌며 항목마다 '나쁨 이상'인 구역 수를 센다.
   * 많은 항목이 위로 오게 정렬해 전교 공통 문제를 먼저 읽히게 한다.
   */
  const metricBars = useMemo(() => {
    const rows = METRICS.map((m) => {
      let bad = 0;
      for (const z of allZones) if (isBad(metricGrade(m.key, z.reading[m.key]))) bad++;
      return { ...m, bad };
    });
    return rows.sort((a, b) => b.bad - a.bad);
  }, [allZones]);

  /** 막대 길이 기준. 전부 0이어도 0으로 나누지 않도록 한다. */
  const zoneTotal = allZones.length;

  /**
   * 4. 읍면동(region)별 요약.
   * 학교 수 + 그 지역 학교들의 최악 상태(worst). 나쁜 지역을 위로 올린다.
   */
  const regionRows = useMemo(() => {
    const m = new Map<string, { region: string; city: string; count: number; statuses: Status[] }>();
    for (const s of schools) {
      const cur = m.get(s.region);
      if (cur) {
        cur.count++;
        cur.statuses.push(s.status);
      } else {
        m.set(s.region, { region: s.region, city: s.city, count: 1, statuses: [s.status] });
      }
    }
    const rank: Record<Status, number> = { critical: 0, warning: 1, normal: 2 };
    return [...m.values()]
      .map((r) => ({ region: r.region, city: r.city, count: r.count, status: worst(r.statuses) }))
      .sort(
        (a, b) =>
          rank[a.status] - rank[b.status] ||
          b.count - a.count ||
          a.region.localeCompare(b.region, 'ko'),
      );
  }, [schools]);

  /** 1. 최상단 요약 숫자 4개. */
  const summary: Array<{ label: string; value: number; color: string | null }> = [
    { label: '전체 학교', value: schools.length, color: null },
    { label: STATUS_LABEL.critical, value: counts.critical, color: STATUS_COLOR.critical },
    { label: STATUS_LABEL.warning, value: counts.warning, color: STATUS_COLOR.warning },
    { label: STATUS_LABEL.normal, value: counts.normal, color: STATUS_COLOR.normal },
  ];

  return (
    <PanelShell
      title="개요"
      subtitle={`전체 ${schools.length}개교 · 측정구역 ${zoneTotal}곳 · 경보 ${alarms.length}건 · 측정값은 목업`}
      onClose={onClose}
      wide
    >
      <div className="flex flex-col gap-7">
        {/* ── 1. 상태별 학교 수 ─────────────────────────────── */}
        <section>
          <div className="grid grid-cols-4 gap-3">
            {summary.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-[#E2E6EC] bg-white px-5 py-4"
                style={s.color ? { borderLeft: `6px solid ${s.color}` } : undefined}
              >
                <div className="flex items-center gap-2">
                  {s.color && (
                    <i
                      className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/15"
                      style={{ background: s.color }}
                    />
                  )}
                  <span className="text-[16px] font-semibold text-[#5A6473]">{s.label}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="font-mono text-[44px] font-bold leading-none tabular-nums text-[#1C2430]">
                    {s.value}
                  </span>
                  <span className="text-[17px] font-medium text-[#5A6473]">개교</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 2. 경보 중인 학교 ─────────────────────────────── */}
        <section>
          <SectionTitle
            title="지금 경보 중인 학교"
            note={`${alarmRows.length}건 · 나쁨 이상이 지속된 학교`}
          />

          {alarmRows.length === 0 ? (
            <div className="rounded-xl border border-[#E2E6EC] bg-[#F7F9FB] px-5 py-8 text-center">
              <p className="text-[17px] font-semibold text-[#1C2430]">경보 중인 학교가 없습니다.</p>
              <p className="mt-1 text-[15px] text-[#5A6473]">
                모든 학교가 &lsquo;나쁨&rsquo; 아래입니다.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#E2E6EC]">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#F3F6F9] text-[14px] font-semibold text-[#5A6473]">
                    <th className="px-4 py-2.5">학교</th>
                    <th className="px-4 py-2.5">구역</th>
                    <th className="px-4 py-2.5">등급</th>
                    <th className="px-4 py-2.5">가장 나쁜 항목</th>
                    <th className="px-4 py-2.5 text-right">값</th>
                    <th className="px-4 py-2.5 text-right">경과</th>
                  </tr>
                </thead>
                <tbody>
                  {alarmRows.map(({ alarm, school, zone, hit }) => {
                    const color = GRADE_COLOR[alarm.grade];
                    const clearing = alarm.clearingSince !== null;
                    return (
                      <tr
                        key={school.id}
                        onClick={() => onSelect(school.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelect(school.id);
                          }
                        }}
                        title="클릭하면 해당 학교를 봅니다"
                        className="cursor-pointer border-t border-[#E2E6EC] transition-colors hover:bg-[#F1F8F8]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <i
                              className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/15"
                              style={{ background: color }}
                            />
                            <span className="text-[17px] font-bold text-[#1C2430]">
                              {school.name}
                            </span>
                            <span className="font-mono text-[13px] tracking-[0.1em] text-[#5A6473]">
                              {school.id}
                            </span>
                          </div>
                          <div className="mt-0.5 pl-6 text-[14px] text-[#5A6473]">
                            {school.city} {school.region}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[16px] font-medium text-[#1C2430]">
                          {zone.kind}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[16px] font-bold" style={{ color }}>
                            {GRADE_LABEL[alarm.grade]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[16px] font-semibold text-[#1C2430]">
                            {hit.label}
                          </span>
                          <span className="ml-2 text-[14px] text-[#5A6473]">
                            {GRADE_LABEL[hit.grade]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-[20px] font-bold tabular-nums text-[#1C2430]">
                            {fmt(hit.key, hit.value)}
                          </span>
                          <span className="ml-1 text-[13px] text-[#5A6473]">{hit.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-[17px] font-semibold tabular-nums text-[#1C2430]">
                            {elapsedLabel(alarm.raisedAt, now)}
                          </span>
                          {clearing && (
                            <div className="mt-0.5 text-[13px] font-semibold text-[#0E8F8F]">
                              호전 · 해제 대기
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── 3·4. 항목별 전교 현황 + 읍면동별 요약 ────────────── */}
        <div className="grid grid-cols-[1.35fr_1fr] gap-6">
          <section>
            <SectionTitle
              title="항목별 전교 현황"
              note={`전체 ${zoneTotal}개 구역 중 '나쁨' 이상`}
            />
            <div className="rounded-xl border border-[#E2E6EC] px-5 py-4">
              <ul className="flex flex-col gap-3">
                {metricBars.map((m) => {
                  const pct = zoneTotal > 0 ? (m.bad / zoneTotal) * 100 : 0;
                  const on = m.bad > 0;
                  return (
                    <li key={m.key} className="flex items-center gap-3">
                      <span className="w-[86px] shrink-0 text-[16px] font-bold text-[#1C2430]">
                        {m.label}
                      </span>
                      <span className="w-[54px] shrink-0 text-[13px] text-[#5A6473]">{m.unit}</span>
                      <span className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-[#EEF1F5]">
                        <span
                          className="absolute inset-y-0 left-0 rounded-md"
                          style={{
                            width: `${pct}%`,
                            background: on ? GRADE_COLOR.bad : 'transparent',
                          }}
                        />
                      </span>
                      <span className="w-[120px] shrink-0 text-right">
                        <span
                          className="font-mono text-[20px] font-bold tabular-nums"
                          style={{ color: on ? GRADE_COLOR.bad : '#5A6473' }}
                        >
                          {m.bad}
                        </span>
                        <span className="font-mono text-[15px] tabular-nums text-[#5A6473]">
                          {' / '}
                          {zoneTotal}
                        </span>
                        <span className="ml-1.5 text-[14px] font-semibold text-[#1C2430]">
                          {on ? GRADE_LABEL.bad : '없음'}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 border-t border-[#E2E6EC] pt-3 text-[14px] text-[#5A6473]">
                온도·습도는 법정 기준이 확정되지 않아 판정에서 제외한다. 상세 화면에서
                &lsquo;참고&rsquo;로만 표시한다.
              </p>
            </div>
          </section>

          <section>
            <SectionTitle title="읍면동별 현황" note={`${regionRows.length}개 지역`} />
            <div className="overflow-hidden rounded-xl border border-[#E2E6EC]">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#F3F6F9] text-[14px] font-semibold text-[#5A6473]">
                    <th className="px-4 py-2.5">읍면동</th>
                    <th className="px-4 py-2.5 text-right">학교</th>
                    <th className="px-4 py-2.5">최악 상태</th>
                  </tr>
                </thead>
                <tbody>
                  {regionRows.map((r) => (
                    <tr key={r.region} className="border-t border-[#E2E6EC]">
                      <td className="px-4 py-2.5">
                        <span className="text-[16px] font-semibold text-[#1C2430]">{r.region}</span>
                        <span className="ml-2 text-[13px] text-[#5A6473]">{r.city}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-[19px] font-bold tabular-nums text-[#1C2430]">
                          {r.count}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusChip status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </PanelShell>
  );
}
