'use client';

import { useMemo, useState } from 'react';

import PanelShell from '@/components/PanelShell';
import {
  GRADE_COLOR,
  GRADE_LABEL,
  GRADE_THRESHOLDS,
  gradeBlinks,
  metricGrade,
  readingGrade,
} from '@/lib/thresholds';
import type { Grade, JudgedMetric } from '@/lib/thresholds';
import type { School, Zone, ZoneKind } from '@/lib/types';

/**
 * 구역별 현황 — 전체 학교의 전체 구역을 한 표에서 비교한다.
 *
 * 왜 표가 필요한가
 * ----------------
 * 지도는 "어디가 나쁜가"는 보여주지만 "얼마나 나쁜가"를 비교할 수 없다.
 * 마커 색은 3단계로 축약돼 있어 CO2 1,600ppm과 1,990ppm이 같은 색으로 보인다.
 * 이 패널은 그 반대쪽을 맡는다 — 위치는 버리고 수치 비교만 한다.
 *
 * 12개교 × 2구역 = 24행. 전부 그린다. 가상 스크롤·페이지네이션을 넣지 않는다
 * (24행은 DOM에 다 올려도 부담이 없고, 관제 화면에서 "스크롤하면 더 있다"는
 * 숨은 상태는 오히려 위험하다).
 *
 * 기본 정렬은 종합등급 나쁜 순이다. 관제 화면이므로 문제가 항상 위에 와야 한다.
 *
 * 판정 항목은 조리실공기질기준표 6항목뿐이다. 온도·습도는 기준표에 없어
 * 열을 만들지 않는다(값만 보려면 학교 상세 창을 쓴다).
 */

/* ------------------------------------------------------------------ *
 * 열 정의
 * ------------------------------------------------------------------ */

interface MetricColumn {
  key: JudgedMetric;
  label: string;
  unit: string;
  /** 표시 소수 자릿수. AlarmDetail / 학교 배포본 표기와 같게 맞춘 값. */
  decimals: number;
}

/** 표시 순서는 AlarmDetail과 동일하게 맞춘다(화면 간 항목 순서가 흔들리면 오독한다). */
const METRIC_COLUMNS: MetricColumn[] = [
  { key: 'pm10', label: '미세먼지', unit: '㎍/㎥', decimals: 0 },
  { key: 'pm25', label: '초미세먼지', unit: '㎍/㎥', decimals: 0 },
  { key: 'co2', label: 'CO₂', unit: 'ppm', decimals: 0 },
  { key: 'voc', label: 'VOC', unit: 'ppb', decimals: 0 },
  { key: 'hcho', label: 'HCHO', unit: '㎍/㎥', decimals: 1 },
  { key: 'co', label: 'CO', unit: 'ppm', decimals: 1 },
];

/* ------------------------------------------------------------------ *
 * 등급 → 색
 * ------------------------------------------------------------------ */

const GRADE_RANK: Record<Grade, number> = {
  veryGood: 0,
  good: 1,
  normal: 2,
  bad: 3,
  veryBad: 4,
};

/**
 * 흰 바탕용 수치 글자색.
 *
 * ⚠️ 기준표 원문 RGB(GRADE_COLOR)는 어두운 배경에서 고른 값이다. 이 패널은
 * 흰 바탕이라 그대로 글자색으로 쓰면 읽히지 않는다 — 좋음 #F0EF00은 흰 바탕
 * 대비 1.08:1, 매우좋음 #92D050은 1.9:1, 보통 #FFC000은 1.9:1이다.
 * 50인치 TV를 멀리서 보는 화면에서 수치가 안 읽히면 표의 존재 의미가 없다.
 *
 * 따라서 이 상수는 **글자색 전용**이고 기준표 색을 바꾸는 것이 아니다.
 * 기준표 원문 RGB는 종합등급 칩의 배경색(GRADE_COLOR)으로 그대로 쓴다.
 *
 * 정상 구간(매우좋음·좋음)은 일부러 색을 입히지 않는다. 관제 화면에서
 * 모든 셀이 색을 가지면 이상값이 묻힌다 — 튀어야 할 것만 튀게 둔다.
 */
const GRADE_TEXT_ON_WHITE: Record<Grade, string> = {
  veryGood: '#1C2430',
  good: '#1C2430',
  normal: '#A86A00', // #FFC000과 같은 색상(hue), 흰 바탕에서 읽히도록 명도만 내렸다
  bad: '#F00000', // 기준표 원문 RGB 그대로
  veryBad: '#F00000', // 기준표 원문 RGB 그대로 (점멸로 나쁨과 구분)
};

/** 종합등급 칩의 글자색. 칩 배경은 기준표 원문 RGB이므로 거기에 맞춰 고른다. */
const GRADE_CHIP_TEXT: Record<Grade, string> = {
  veryGood: '#1C2430',
  good: '#1C2430',
  normal: '#1C2430',
  bad: '#FFFFFF', // 빨강 배경에 어두운 글자는 읽히지 않는다
  veryBad: '#FFFFFF',
};

/** '나쁨' 이상 셀에 깔 옅은 배경(빨강 8%). 행 hover 색이 비치도록 반투명으로 둔다. */
const BAD_CELL_TINT = '#F0000014';

function isBad(g: Grade): boolean {
  return g === 'bad' || g === 'veryBad';
}

/* ------------------------------------------------------------------ *
 * 행 모델
 * ------------------------------------------------------------------ */

interface Row {
  /** React key. 구역 id는 학교를 넘나들어도 유일하다. */
  key: string;
  schoolId: string;
  schoolName: string;
  place: string;
  zoneKind: ZoneKind;
  zone: Zone;
  /** 기준표 6항목 중 가장 나쁜 등급 = 구역 종합등급. */
  grade: Grade;
}

/** 구역 표시 순서. 조리실이 먼저다(센서 1조 기준, 학교 화면과 동일). */
const ZONE_ORDER: Record<ZoneKind, number> = { 조리실: 0, 세척실: 1 };

/* ------------------------------------------------------------------ *
 * 필터
 * ------------------------------------------------------------------ */

type FilterKey = 'all' | 'bad' | '조리실' | '세척실';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'bad', label: '나쁨 이상만' },
  { key: '조리실', label: '조리실만' },
  { key: '세척실', label: '세척실만' },
];

function passesFilter(row: Row, filter: FilterKey): boolean {
  switch (filter) {
    case 'bad':
      return isBad(row.grade);
    case '조리실':
    case '세척실':
      return row.zoneKind === filter;
    case 'all':
    default:
      return true;
  }
}

/* ------------------------------------------------------------------ *
 * 정렬
 * ------------------------------------------------------------------ */

type SortKey = JudgedMetric | 'school' | 'zone' | 'grade';
type SortDir = 'asc' | 'desc';

/** 오름차순 기준 비교. 내림차순은 결과를 뒤집어 쓴다. */
function compareAsc(a: Row, b: Row, key: SortKey): number {
  switch (key) {
    case 'school':
      return a.schoolName.localeCompare(b.schoolName, 'ko');
    case 'zone':
      return ZONE_ORDER[a.zoneKind] - ZONE_ORDER[b.zoneKind];
    case 'grade':
      return GRADE_RANK[a.grade] - GRADE_RANK[b.grade];
    default:
      return a.zone.reading[key] - b.zone.reading[key];
  }
}

/**
 * 동점 시 항상 같은 순서가 나오게 하는 2차 키.
 *
 * 값이 5초마다 갱신되는 화면이라 동점 처리를 비워 두면 같은 등급 행들이
 * 갱신마다 자리를 바꿔 눈이 따라갈 수 없다. 2차 키는 정렬 방향과 무관하게
 * 늘 오름차순으로 둬야 한다(뒤집으면 같은 문제가 반대로 생긴다).
 */
function tiebreak(a: Row, b: Row): number {
  const byName = a.schoolName.localeCompare(b.schoolName, 'ko');
  if (byName !== 0) return byName;
  return ZONE_ORDER[a.zoneKind] - ZONE_ORDER[b.zoneKind];
}

/* ------------------------------------------------------------------ *
 * 패널
 * ------------------------------------------------------------------ */

interface Props {
  schools: School[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

export default function ZoneGridPanel({ schools, onClose, onSelect }: Props) {
  // 기본 정렬: 종합등급 나쁜 순(관제 화면이라 문제가 위에 와야 한다).
  const [sortKey, setSortKey] = useState<SortKey>('grade');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filter, setFilter] = useState<FilterKey>('all');

  /** 학교 → 구역으로 평탄화. props에 있는 값만 쓴다(없는 데이터를 만들지 않는다). */
  const rows = useMemo<Row[]>(
    () =>
      schools.flatMap((school) =>
        school.zones.map((zone) => ({
          key: zone.id,
          schoolId: school.id,
          schoolName: school.name,
          place: `${school.city} ${school.region}`,
          zoneKind: zone.kind,
          zone,
          grade: readingGrade(zone.reading),
        })),
      ),
    [schools],
  );

  const visible = useMemo(() => {
    const filtered = rows.filter((r) => passesFilter(r, filter));
    const sign = sortDir === 'desc' ? -1 : 1;
    return filtered.sort((a, b) => {
      const primary = compareAsc(a, b, sortKey) * sign;
      return primary !== 0 ? primary : tiebreak(a, b);
    });
  }, [rows, filter, sortKey, sortDir]);

  const badCount = useMemo(() => rows.filter((r) => isBad(r.grade)).length, [rows]);

  /**
   * 머리글 클릭: 새 열이면 내림차순부터, 같은 열을 다시 누르면 방향을 뒤집는다.
   * 수치 열에서 '큰 값이 먼저'가 관제 화면의 기본 관심사라 내림차순을 먼저 준다.
   */
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const subtitle = `${schools.length}개교 · ${rows.length}구역 · 나쁨 이상 ${badCount}구역 · 측정값은 목업`;

  return (
    <PanelShell title="구역별 현황" subtitle={subtitle} onClose={onClose} wide>
      {/* 필터 — 단일 선택. 현재 선택을 강조한다. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] text-[#5A6473]">보기</span>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={[
                'rounded-lg border px-3.5 py-1.5 text-[14px] font-medium transition-colors',
                active
                  ? 'border-[#0E8F8F] bg-[#0E8F8F] text-white'
                  : 'border-[#D9DFE7] bg-white text-[#5A6473] hover:bg-[#F1F4F8] hover:text-[#1C2430]',
              ].join(' ')}
            >
              {f.label}
            </button>
          );
        })}
        <span className="ml-auto text-[13px] text-[#5A6473]">
          {visible.length}행 표시 · 머리글을 눌러 정렬
        </span>
      </div>

      <table className="w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            <HeaderCell
              label="학교명"
              sortKey="school"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              align="left"
            />
            <HeaderCell
              label="구역"
              sortKey="zone"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              align="left"
            />
            {METRIC_COLUMNS.map((col) => (
              <HeaderCell
                key={col.key}
                label={col.label}
                sub={col.unit}
                hint={`나쁨 ${GRADE_THRESHOLDS[col.key].bad}${col.unit} 이상`}
                sortKey={col.key}
                activeKey={sortKey}
                dir={sortDir}
                onSort={handleSort}
                align="right"
              />
            ))}
            <HeaderCell
              label="종합등급"
              sub="6항목 중 최악"
              sortKey="grade"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
              align="center"
            />
          </tr>
        </thead>

        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td
                colSpan={METRIC_COLUMNS.length + 3}
                className="border-b border-[#E2E6EC] px-3 py-10 text-center text-[15px] text-[#5A6473]"
              >
                조건에 맞는 구역이 없습니다.
                {filter === 'bad' && ' 현재 나쁨 이상인 구역이 없습니다.'}
              </td>
            </tr>
          ) : (
            visible.map((row) => (
              <tr
                key={row.key}
                onClick={() => onSelect(row.schoolId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(row.schoolId);
                  }
                }}
                tabIndex={0}
                aria-label={`${row.schoolName} ${row.zoneKind} ${GRADE_LABEL[row.grade]}`}
                className="cursor-pointer transition-colors hover:bg-[#F1F4F8] focus:bg-[#F1F4F8] focus:outline-none"
              >
                {/* 학교명 */}
                <td className="whitespace-nowrap border-b border-[#E2E6EC] px-3 py-2.5">
                  <div className="text-[15px] font-semibold text-[#1C2430]">{row.schoolName}</div>
                  <div className="text-[12px] text-[#5A6473]">{row.place}</div>
                </td>

                {/* 구역 */}
                <td className="whitespace-nowrap border-b border-[#E2E6EC] px-3 py-2.5 text-[15px] text-[#1C2430]">
                  {row.zoneKind}
                </td>

                {/* 측정 6항목 */}
                {METRIC_COLUMNS.map((col) => {
                  const value = row.zone.reading[col.key];
                  const grade = metricGrade(col.key, value);
                  const bad = isBad(grade);
                  return (
                    <td
                      key={col.key}
                      className="whitespace-nowrap border-b border-[#E2E6EC] px-3 py-2.5 text-right font-mono text-[16px] tabular-nums"
                      style={{
                        color: GRADE_TEXT_ON_WHITE[grade],
                        fontWeight: bad ? 700 : 500,
                        backgroundColor: bad ? BAD_CELL_TINT : undefined,
                      }}
                      title={`${col.label} ${value.toFixed(col.decimals)}${col.unit} · ${GRADE_LABEL[grade]}`}
                    >
                      {/* 매우나쁨은 나쁨과 색이 같다(기준표 '240.0.0점멸') — 점멸로 가른다. */}
                      <span className={gradeBlinks(grade) ? 'vaq-blink' : undefined}>
                        {value.toFixed(col.decimals)}
                      </span>
                    </td>
                  );
                })}

                {/* 종합등급 — 색만으로 구분하지 않고 등급명 글자를 함께 넣는다. */}
                <td
                  className="whitespace-nowrap border-b border-[#E2E6EC] px-3 py-2.5 text-center"
                  style={{ backgroundColor: isBad(row.grade) ? BAD_CELL_TINT : undefined }}
                >
                  <span
                    className={`inline-block min-w-[66px] rounded-md px-2 py-1 text-[15px] font-bold${
                      gradeBlinks(row.grade) ? ' vaq-blink' : ''
                    }`}
                    style={{
                      backgroundColor: GRADE_COLOR[row.grade],
                      color: GRADE_CHIP_TEXT[row.grade],
                    }}
                  >
                    {GRADE_LABEL[row.grade]}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p className="mt-4 border-t border-[#E2E6EC] pt-3 text-[12px] leading-relaxed text-[#5A6473]">
        판정 기준은 조리실공기질기준표(현장 탑재 정본) 5단계 —
        매우좋음/좋음/보통/나쁨/매우나쁨. 나쁨과 매우나쁨은 기준표가 같은 색을 지정하므로 매우나쁨만
        점멸로 구분한다. 종합등급은 기준표 6항목 중 가장 나쁜 등급이며, 온도·습도는 기준표에 없어
        판정하지 않고 열도 두지 않는다. 행을 누르면 해당 학교 상세로 이동한다.
      </p>
    </PanelShell>
  );
}

/* ------------------------------------------------------------------ *
 * 정렬 가능한 머리글
 * ------------------------------------------------------------------ */

interface HeaderCellProps {
  label: string;
  /** 단위나 보조 설명. 둘째 줄에 작게 깐다. */
  sub?: string;
  hint?: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align: 'left' | 'right' | 'center';
}

/**
 * sticky top-0 + 흰 배경이 핵심이다. 배경을 주지 않으면 스크롤된 행이
 * 머리글 뒤로 비쳐 수치가 겹쳐 읽힌다.
 *
 * border-collapse를 쓰면 sticky 요소의 테두리가 사라지는 브라우저가 있어
 * 표 전체를 border-separate로 두고 테두리를 셀에 직접 건다.
 */
function HeaderCell({
  label,
  sub,
  hint,
  sortKey,
  activeKey,
  dir,
  onSort,
  align,
}: HeaderCellProps) {
  const active = activeKey === sortKey;
  const justify =
    align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}
      className="sticky top-0 z-10 border-b-2 border-[#E2E6EC] bg-white p-0"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={hint}
        className={`flex w-full flex-col gap-0.5 px-3 py-2.5 transition-colors hover:bg-[#F1F4F8] ${
          align === 'right' ? 'items-end' : align === 'center' ? 'items-center' : 'items-start'
        }`}
      >
        <span className={`flex items-center gap-1 ${justify}`}>
          <span
            className="text-[14px] font-bold"
            style={{ color: active ? '#0E8F8F' : '#1C2430' }}
          >
            {label}
          </span>
          {/* 화살표 자리를 늘 비워 둔다 — 정렬을 바꿀 때 열 폭이 움직이면 눈이 흔들린다. */}
          <span
            aria-hidden
            className="w-[11px] text-[11px] leading-none"
            style={{ color: active ? '#0E8F8F' : 'transparent' }}
          >
            {active ? (dir === 'desc' ? '▼' : '▲') : '▼'}
          </span>
        </span>
        {sub && <span className="text-[11px] font-normal text-[#5A6473]">{sub}</span>}
      </button>
    </th>
  );
}
