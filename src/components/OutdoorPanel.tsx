'use client';

import { useMemo } from 'react';
import type { School, Zone } from '@/lib/types';
import {
  REGIONS,
  regionOf,
  pm10Grade,
  pm25Grade,
  GRADE_COLOR as OUTDOOR_GRADE_COLOR,
  buildOutdoor,
} from '@/lib/outdoor';
import type { RegionId, OutdoorReading } from '@/lib/outdoor';
import {
  compareIndoorOutdoor,
  describeOutdoorCompare,
  VERDICT_LABEL,
  COMPARED_METRICS,
} from '@/lib/outdoorCompare';
import type {
  OutdoorCompareVerdict,
  OutdoorCompareResult,
  MetricComparison,
} from '@/lib/outdoorCompare';
import { readingGrade, GRADE_LABEL } from '@/lib/thresholds';
import PanelShell from './PanelShell';

/**
 * 실외 대기질 — 실내외 대비 패널.
 *
 * ## 이 화면이 답하려는 질문
 *
 * "바깥이 나쁜 날, 우리 학교 급식실은 그 영향을 받고 있는가."
 *
 * 핵심 직관은 역전되어 있다. 급기 필터가 제 역할을 하면 실외 오염은 실내로
 * 들어오지 못하므로 **실내외 상관이 낮은 것이 정상**이다. 실외가 나쁜데 실내도
 * 같이 나빠지면 필터 파손·누기·바이패스·틈새 침입을 의심한다.
 * 그래서 이 화면은 실내 절대값이 아니라 실외 대비 **패턴**을 보여준다.
 *
 * ## 판정 로직을 여기서 만들지 않는다
 *
 * 판정은 전부 src/lib/outdoorCompare.ts의 `compareIndoorOutdoor()`가 내고,
 * 근거 문장은 같은 모듈의 `describeOutdoorCompare()`가 만든다.
 * 이 컴포넌트는 (1) 학교가 속한 권역을 `regionOf()`로 고르고
 * (2) 그 권역의 실외값과 구역 실내값을 함수에 넘기고 (3) 결과를 그리기만 한다.
 * 경계 비율(RATIO_*)·오염 경계(DIRTY_LEVEL)는 여기서 참조하지도, 바꾸지도 않는다.
 *
 * ## 화면에 반드시 남겨야 하는 단서
 *
 * - 경계 비율은 현장 검증 전의 **잠정값**이다. 확정된 판정처럼 보이면 안 되므로
 *   점선 테두리 + 호박색 배지를 상시 띄운다.
 * - 실외는 1시간, 실내는 5초 해상도다. 같은 시점 비교가 아니라는 점을 적는다.
 * - 실외는 4권역 평균이라 학교 바로 앞 외기와 다르다.
 *
 * 색만으로 판정을 구분하지 않는다. 모든 배지에 판정명 글자를 함께 넣는다.
 */

interface Props {
  schools: School[];
  outdoor: ReturnType<typeof buildOutdoor>;
  onClose: () => void;
  onSelect: (id: string) => void;
}

/* ------------------------------------------------------------------ *
 * 표시용 상수 — 판정 로직이 아니라 "화면에 어떤 순서로 놓을까"만 정한다.
 * ------------------------------------------------------------------ */

/**
 * 집계 카드와 표의 나열 순서. 조치가 급한 쪽이 앞이다.
 * outdoorCompare.ts 내부의 VERDICT_RANK와 목적이 다르다 — 그쪽은 항목별 판정을
 * 종합 판정으로 접을 때 쓰는 우선순위이고, 여기 것은 순수한 표시 순서다.
 * 이 배열을 바꿔도 판정 결과는 달라지지 않는다.
 */
const VERDICT_ORDER: readonly OutdoorCompareVerdict[] = [
  'infiltrationSuspect',
  'indoorSource',
  'indeterminate',
  'filterEffective',
  'clear',
] as const;

/** 판정별 배지 색. 색은 보조 수단이고 글자(VERDICT_LABEL)가 본 수단이다. */
const VERDICT_STYLE: Record<OutdoorCompareVerdict, { fg: string; bg: string; bd: string }> = {
  infiltrationSuspect: { fg: '#B42318', bg: '#FEF3F2', bd: '#FDA29B' },
  indoorSource: { fg: '#B54708', bg: '#FFFAEB', bd: '#FEC84B' },
  indeterminate: { fg: '#5A6473', bg: '#F1F4F8', bd: '#D9DFE7' },
  filterEffective: { fg: '#0E8F8F', bg: '#ECFAFA', bd: '#7FD4D4' },
  clear: { fg: '#3F6212', bg: '#F4FBE8', bd: '#BBDE7A' },
};

/** 판정 한 줄 요약 — 집계 카드에서 "그래서 뭘 뜻하나"를 같이 보여준다. */
const VERDICT_HINT: Record<OutdoorCompareVerdict, string> = {
  infiltrationSuspect: '실외·실내가 함께 나쁨 → 급기 필터·누기 점검',
  indoorSource: '실외는 괜찮은데 실내만 나쁨 → 조리 발생원·배기 확인',
  indeterminate: '경계 구간 → 단일 시점으로는 못 가름',
  filterEffective: '실외가 나쁜데 실내는 낮음 → 여과가 듣는 중',
  clear: '실내외 모두 양호 (필터 성능은 미검증)',
};

const METRIC_LABEL: Record<(typeof COMPARED_METRICS)[number], string> = {
  pm10: 'PM10',
  pm25: 'PM2.5',
};

/* ------------------------------------------------------------------ *
 * 작은 조각들
 * ------------------------------------------------------------------ */

/** 현장 검증 전임을 알리는 상시 배지. 점선 + 호박색으로 "확정 아님"을 표시한다. */
function ProvisionalBadge({ compact }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-dashed border-[#F5A623] bg-[#FFFBF2] font-medium text-[#8A5A00] ${
        compact ? 'px-2 py-0.5 text-[13px]' : 'px-3 py-1.5 text-[15px]'
      }`}
      title="실내/실외 비율 경계값은 실제 설치 필터 등급과 급기/재순환 비율을 확인해야 확정됩니다."
    >
      <span aria-hidden>⚠</span>
      판정 기준 미확정 · 현장 검증 필요
    </span>
  );
}

function VerdictBadge({ verdict, compact }: { verdict: OutdoorCompareVerdict; compact?: boolean }) {
  const s = VERDICT_STYLE[verdict];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border font-semibold ${
        compact ? 'px-1.5 py-0.5 text-[13px]' : 'px-2.5 py-1 text-[15px]'
      }`}
      style={{ color: s.fg, backgroundColor: s.bg, borderColor: s.bd }}
    >
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: s.fg }}
        aria-hidden
      />
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/** 항목 하나의 실내/실외 수치 셀. 근거 수치를 숨기지 않는다. */
function MetricCell({ mc }: { mc: MetricComparison | undefined }) {
  if (!mc) return <span className="text-[15px] text-[#5A6473]">—</span>;
  return (
    <div className="font-mono text-[15px] tabular-nums leading-tight text-[#1C2430]">
      <span className={mc.indoorDirty ? 'font-bold text-[#B42318]' : ''}>{mc.indoor}</span>
      <span className="text-[#5A6473]"> / </span>
      <span className={mc.outdoorDirty ? 'font-bold text-[#7E22CE]' : 'text-[#5A6473]'}>
        {mc.outdoor}
      </span>
      <div className="font-sans text-[13px] text-[#5A6473]">
        {mc.ratio === null ? '비율 산출 불가' : `비율 ${mc.ratio.toFixed(2)}`}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 본체
 * ------------------------------------------------------------------ */

interface Row {
  school: School;
  region: RegionId;
  /** 판정에 쓴 실내 구역. 조리실을 우선한다. */
  zone: Zone;
  result: OutdoorCompareResult;
  /** 같은 학교의 나머지 구역 판정. 조리실 외 구역을 놓치지 않기 위한 보조 표시. */
  others: Array<{ zone: Zone; result: OutdoorCompareResult }>;
}

export default function OutdoorPanel({ schools, outdoor, onClose, onSelect }: Props) {
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const school of schools) {
      if (school.zones.length === 0) continue; // 구역이 없으면 비교할 실내값이 없다.
      const region = regionOf(school.lat, school.lng);
      const air: OutdoorReading = outdoor[region];

      // 급기 필터 진단의 1차 대상은 조리실이다. 없으면 첫 구역을 쓴다.
      const primary = school.zones.find((z) => z.kind === '조리실') ?? school.zones[0];

      out.push({
        school,
        region,
        zone: primary,
        // 판정은 전적으로 compareIndoorOutdoor()가 낸다.
        result: compareIndoorOutdoor(primary.reading, air),
        others: school.zones
          .filter((z) => z.id !== primary.id)
          .map((z) => ({ zone: z, result: compareIndoorOutdoor(z.reading, air) })),
      });
    }
    // 조치가 급한 판정이 위로 오게 정렬한다(표시 순서일 뿐 판정에 영향 없음).
    return out.sort((a, b) => {
      const d = VERDICT_ORDER.indexOf(a.result.verdict) - VERDICT_ORDER.indexOf(b.result.verdict);
      return d !== 0 ? d : a.school.name.localeCompare(b.school.name, 'ko');
    });
  }, [schools, outdoor]);

  /** 판정별 학교 수(대표 구역 기준)와, 전 구역을 통틀어 센 외기 유입 의심 구역 수. */
  const tally = useMemo(() => {
    const bySchool = {} as Record<OutdoorCompareVerdict, number>;
    for (const v of VERDICT_ORDER) bySchool[v] = 0;
    let infiltrationZones = 0;
    let assessable = 0;
    for (const r of rows) {
      bySchool[r.result.verdict] += 1;
      if (r.result.filterAssessable) assessable += 1;
      for (const z of [r.result, ...r.others.map((o) => o.result)]) {
        if (z.verdict === 'infiltrationSuspect') infiltrationZones += 1;
      }
    }
    return { bySchool, infiltrationZones, assessable };
  }, [rows]);

  /** 권역별 학교 수 — 실외 카드에 "이 권역에 몇 개교가 걸려 있는지" 같이 보여준다. */
  const schoolsPerRegion = useMemo(() => {
    const c = {} as Record<RegionId, number>;
    for (const r of REGIONS) c[r.id] = 0;
    for (const row of rows) c[row.region] += 1;
    return c;
  }, [rows]);

  const infiltration = tally.bySchool.infiltrationSuspect;

  return (
    <PanelShell
      title="실외 대기질 · 실내외 대비"
      subtitle={`${rows.length}개교 비교 · 외기 유입 의심 ${infiltration}개교`}
      onClose={onClose}
      wide
    >
      {/* ── 상시 고지: 잠정 기준 + 해상도 격차 ───────────────────────── */}
      <div className="sticky top-0 z-10 -mx-6 -mt-5 mb-5 border-b border-[#E2E6EC] bg-white px-6 pb-3 pt-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ProvisionalBadge />
          <p className="text-[15px] leading-snug text-[#5A6473]">
            실외 데이터는 <strong className="font-semibold text-[#1C2430]">1시간</strong> 단위,
            실내는 <strong className="font-semibold text-[#1C2430]">5초</strong> 단위로 해상도가
            다릅니다 — 한 실외 슬롯 동안의 실내 변동은 모두 같은 실외값과 비교됩니다.
          </p>
        </div>
      </div>

      {/* ── 1. 권역별 실외 현황 ─────────────────────────────────────── */}
      <section className="mb-7">
        <div className="mb-3 flex items-baseline gap-3">
          <h3 className="text-[17px] font-bold text-[#1C2430]">권역별 실외 현황</h3>
          <span className="text-[15px] text-[#5A6473]">
            한라산 기준 방위각 4분할 · 환경부 4단계 등급
          </span>
        </div>

        <div className="grid grid-cols-4 gap-3">
          {REGIONS.map((r) => {
            const air = outdoor[r.id];
            const g10 = pm10Grade(air.pm10);
            const g25 = pm25Grade(air.pm25);
            return (
              <div key={r.id} className="rounded-xl border border-[#E2E6EC] bg-white p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-[17px] font-bold text-[#1C2430]">{r.name}</span>
                  <span className="text-[13px] text-[#5A6473]">
                    {r.station} · {schoolsPerRegion[r.id] ?? 0}개교
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { label: 'PM10', value: air.pm10, grade: g10 },
                      { label: 'PM2.5', value: air.pm25, grade: g25 },
                    ] as const
                  ).map((m) => (
                    <div
                      key={m.label}
                      className="rounded-lg border px-2.5 py-2"
                      style={{
                        borderColor: OUTDOOR_GRADE_COLOR[m.grade],
                        backgroundColor: `${OUTDOOR_GRADE_COLOR[m.grade]}12`,
                      }}
                    >
                      <div className="text-[13px] text-[#5A6473]">{m.label}</div>
                      <div className="font-mono text-[22px] font-bold tabular-nums leading-tight text-[#1C2430]">
                        {m.value}
                        <span className="ml-1 font-sans text-[13px] font-normal text-[#5A6473]">
                          ㎍/㎥
                        </span>
                      </div>
                      <div
                        className="text-[15px] font-semibold"
                        style={{ color: OUTDOOR_GRADE_COLOR[m.grade] }}
                      >
                        {m.grade}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-2.5 font-mono text-[15px] tabular-nums text-[#5A6473]">
                  {air.temp.toFixed(1)}℃ · 습도 {air.humidity}%
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 2. 판정별 집계 ──────────────────────────────────────────── */}
      <section className="mb-7">
        <div className="mb-3 flex items-baseline gap-3">
          <h3 className="text-[17px] font-bold text-[#1C2430]">판정별 집계</h3>
          <span className="text-[15px] text-[#5A6473]">
            대표 구역(조리실 우선) 기준 학교 수 · 전체 {rows.length}개교
          </span>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {VERDICT_ORDER.map((v) => {
            const s = VERDICT_STYLE[v];
            const n = tally.bySchool[v];
            const lead = v === 'infiltrationSuspect';
            return (
              <div
                key={v}
                className="rounded-xl border p-4"
                style={{
                  borderColor: lead && n > 0 ? s.fg : s.bd,
                  backgroundColor: s.bg,
                  borderWidth: lead && n > 0 ? 2 : 1,
                }}
              >
                <div className="text-[15px] font-semibold" style={{ color: s.fg }}>
                  {VERDICT_LABEL[v]}
                </div>
                <div className="font-mono text-[32px] font-bold tabular-nums leading-tight text-[#1C2430]">
                  {n}
                  <span className="ml-1 font-sans text-[15px] font-normal text-[#5A6473]">
                    개교
                  </span>
                </div>
                <div className="mt-1 text-[13px] leading-snug text-[#5A6473]">
                  {VERDICT_HINT[v]}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[15px] text-[#5A6473]">
          <span>
            외기 유입 의심 구역(세척실 포함 전 구역):{' '}
            <strong className="font-mono font-bold tabular-nums text-[#B42318]">
              {tally.infiltrationZones}
            </strong>
            개
          </span>
          <span>
            필터 성능 판정 가능(실외가 나빠 시험 조건이 된 학교):{' '}
            <strong className="font-mono font-bold tabular-nums text-[#1C2430]">
              {tally.assessable}
            </strong>
            /{rows.length}개교
          </span>
          <ProvisionalBadge compact />
        </div>
      </section>

      {/* ── 3. 학교별 실내외 비교 ───────────────────────────────────── */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-[17px] font-bold text-[#1C2430]">학교별 실내외 비교</h3>
          <span className="text-[15px] text-[#5A6473]">
            수치는 <span className="font-mono">실내 / 실외</span> ㎍/㎥ · 행을 누르면 해당 학교로
            이동합니다
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#E2E6EC]">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-[#F7F9FC] text-[13px] font-semibold text-[#5A6473]">
                <th className="px-3 py-2.5">학교</th>
                <th className="px-3 py-2.5">권역</th>
                <th className="px-3 py-2.5">대표 구역</th>
                <th className="px-3 py-2.5">실내 등급</th>
                {COMPARED_METRICS.map((m) => (
                  <th key={m} className="px-3 py-2.5">
                    {METRIC_LABEL[m]} 실내/실외
                  </th>
                ))}
                <th className="px-3 py-2.5">판정</th>
                <th className="w-[32%] px-3 py-2.5">판단 근거</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const regionName = REGIONS.find((r) => r.id === row.region)?.name ?? row.region;
                const indoorGrade = readingGrade(row.zone.reading);
                return (
                  <tr
                    key={row.school.id}
                    onClick={() => onSelect(row.school.id)}
                    className="cursor-pointer border-t border-[#E2E6EC] align-top transition-colors hover:bg-[#F1F4F8]"
                  >
                    <td className="px-3 py-3">
                      <div className="text-[15px] font-semibold text-[#1C2430]">
                        {row.school.name}
                      </div>
                      <div className="text-[13px] text-[#5A6473]">
                        {row.school.city} {row.school.region}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[15px] text-[#1C2430]">{regionName}</td>
                    <td className="px-3 py-3">
                      <div className="text-[15px] text-[#1C2430]">{row.zone.kind}</div>
                      {row.others.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.others.map((o) => (
                            <span key={o.zone.id} className="inline-flex items-center gap-1">
                              <span className="text-[13px] text-[#5A6473]">{o.zone.kind}</span>
                              <VerdictBadge verdict={o.result.verdict} compact />
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[15px] text-[#1C2430]">
                      {GRADE_LABEL[indoorGrade]}
                    </td>
                    {COMPARED_METRICS.map((m) => (
                      <td key={m} className="px-3 py-3">
                        <MetricCell mc={row.result.metrics.find((x) => x.metric === m)} />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <VerdictBadge verdict={row.result.verdict} />
                      {!row.result.filterAssessable && (
                        <div className="mt-1 text-[13px] text-[#5A6473]">필터 성능 미검증</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[15px] leading-snug text-[#5A6473]">
                      {describeOutdoorCompare(row.result)}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr className="border-t border-[#E2E6EC]">
                  <td
                    colSpan={6 + COMPARED_METRICS.length}
                    className="px-3 py-8 text-center text-[15px] text-[#5A6473]"
                  >
                    비교할 실내 측정값이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 출처와 한계 — 이 화면의 숫자를 어디까지 믿어도 되는지 적는다. */}
        <ul className="mt-3 space-y-1 text-[13px] leading-snug text-[#5A6473]">
          <li>
            · 판정은 <span className="font-mono">compareIndoorOutdoor()</span>, 근거 문장은{' '}
            <span className="font-mono">describeOutdoorCompare()</span>
            (src/lib/outdoorCompare.ts)의 결과를 그대로 표시합니다.
          </li>
          <li>
            · 실외값은 4권역 평균이라 학교 바로 앞 외기와 다를 수 있습니다. 급기구 유입 시차(lag)도
            보정하지 않았습니다.
          </li>
          <li>
            · 조리 시간표가 없어 조리 중 여부를 가르지 못합니다 — &lsquo;실내 발생원&rsquo;은 조리
            중이면 정상일 수 있습니다.
          </li>
          <li>· 비교 항목은 실외 데이터에 대응값이 있는 PM10·PM2.5 두 가지뿐입니다.</li>
        </ul>
      </section>
    </PanelShell>
  );
}
