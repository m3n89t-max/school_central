'use client';

import PanelShell from '@/components/PanelShell';
import type { Alarm } from '@/lib/alarm';
import {
  CLEAR_HOLD_MS,
  MAX_POPUPS,
  RISE_HOLD_MS,
  elapsedLabel,
  sortAlarms,
} from '@/lib/alarm';
import {
  GRADE_COLOR,
  GRADE_LABEL,
  GRADE_THRESHOLDS,
  metricGrade,
} from '@/lib/thresholds';
import type { Grade, JudgedMetric } from '@/lib/thresholds';
import type { School, Zone } from '@/lib/types';

/**
 * 경보 전체 목록 패널 — '알림' 메뉴.
 *
 * 왜 따로 두나
 * ------------
 * 지도 위 자동 팝업(AlarmGrid)은 화면을 덮지 않으려고 동시에 MAX_POPUPS장까지만
 * 띄운다. 그 뒤에 가려진 경보가 있어도 관제자는 모른다. 이 패널은 지금 올라와
 * 있는 경보를 하나도 빼지 않고 한 화면에 모아 보여주는 '전체 명부'다.
 *
 * 읽기 전용이다
 * -------------
 * 경보가 뜨고 닫히는 판정은 전부 lib/alarm.ts(stepAlarms)가 한다. 여기서는
 * props로 받은 alarms를 정렬해 그리기만 한다. 판정을 다시 구현하지 않는다.
 * 읽음/확인 처리나 알림 발송 같은 상태 변경 기능도 두지 않는다 — 승인 범위 밖이다.
 *
 * 하단 '경보 규칙' 박스의 숫자는 RISE_HOLD_MS / CLEAR_HOLD_MS 상수에서 그대로
 * 환산한다. 상수가 바뀌면 설명도 같이 바뀌어야 하므로 숫자를 적어두지 않는다.
 */

/** 심각도 비교용 순위. 값이 클수록 나쁘다. */
const GRADE_ORDER: Record<Grade, number> = {
  veryGood: 0,
  good: 1,
  normal: 2,
  bad: 3,
  veryBad: 4,
};

interface MetricSpec {
  key: JudgedMetric;
  label: string;
  unit: string;
  decimals: number;
}

/**
 * 기준표 판정 6항목. 온도·습도는 기준표에 없는 참고값이라 경보 사유가 될 수 없고,
 * 여기(가장 나쁜 항목 고르기)에서도 제외한다.
 * 표기(라벨·단위·소수 자릿수)는 상세 창(AlarmDetail)과 같게 맞췄다.
 */
const METRICS: MetricSpec[] = [
  { key: 'pm10', label: '미세먼지(PM10)', unit: '㎍/㎥', decimals: 0 },
  { key: 'pm25', label: '초미세먼지(PM2.5)', unit: '㎍/㎥', decimals: 0 },
  { key: 'co2', label: '이산화탄소(CO₂)', unit: 'ppm', decimals: 0 },
  { key: 'voc', label: 'VOC', unit: 'ppb', decimals: 0 },
  { key: 'hcho', label: '포름알데히드(HCHO)', unit: '㎍/㎥', decimals: 1 },
  { key: 'co', label: '일산화탄소(CO)', unit: 'ppm', decimals: 1 },
];

interface WorstMetric extends MetricSpec {
  value: number;
  grade: Grade;
}

/** 구역 안에서 가장 나쁜 항목. 등급이 같으면 '나쁨' 기준선을 더 많이 넘은 쪽. */
function worstMetricOf(zone: Zone): WorstMetric {
  const scored: WorstMetric[] = METRICS.map((m) => ({
    ...m,
    value: zone.reading[m.key],
    grade: metricGrade(m.key, zone.reading[m.key]),
  }));

  return scored.reduce((a, b) => {
    const d = GRADE_ORDER[b.grade] - GRADE_ORDER[a.grade];
    if (d !== 0) return d > 0 ? b : a;
    const ra = a.value / GRADE_THRESHOLDS[a.key].bad;
    const rb = b.value / GRADE_THRESHOLDS[b.key].bad;
    return rb > ra ? b : a;
  });
}

/** 학교 안에서 가장 나쁜 구역. 학교 등급(schoolGrade)을 만든 구역이다. */
function worstZoneOf(school: School): Zone | null {
  if (school.zones.length === 0) return null;
  return school.zones.reduce((a, b) =>
    GRADE_ORDER[worstMetricOf(b).grade] > GRADE_ORDER[worstMetricOf(a).grade] ? b : a,
  );
}

/** 밀리초를 '10초' / '3분' / '1분 30초' 문장 조각으로. 규칙 설명에 쓴다. */
function holdLabel(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest === 0 ? `${min}분` : `${min}분 ${rest}초`;
}

/** 등급명을 색과 함께 다는 배지. 색만으로 구분하지 않도록 글자를 반드시 같이 넣는다. */
function GradeBadge({ grade }: { grade: Grade }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[15px] font-bold"
      style={{
        color: GRADE_COLOR[grade],
        borderColor: GRADE_COLOR[grade],
        background: `${GRADE_COLOR[grade]}14`,
      }}
    >
      <i
        aria-hidden
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: GRADE_COLOR[grade] }}
      />
      {GRADE_LABEL[grade]}
    </span>
  );
}

function AlarmRow({
  alarm,
  school,
  now,
  onSelect,
}: {
  alarm: Alarm;
  school: School | undefined;
  now: number;
  onSelect: (id: string) => void;
}) {
  const clearing = alarm.clearingSince !== null;
  // 해제까지 남은 초 — 자동으로 닫힌다는 사실을 관제자가 볼 수 있어야 한다.
  // 계산식은 AlarmGrid의 축소 카드와 동일하게 맞춘다.
  const clearLeft = clearing
    ? Math.max(0, Math.ceil((CLEAR_HOLD_MS - (now - (alarm.clearingSince as number))) / 1000))
    : 0;

  const zone = school ? worstZoneOf(school) : null;
  const metric = zone ? worstMetricOf(zone) : null;

  return (
    <button
      onClick={() => onSelect(alarm.schoolId)}
      title="누르면 해당 학교를 선택합니다"
      className={`grid w-full grid-cols-[132px_minmax(150px,1fr)_92px_minmax(230px,1.3fr)_92px_136px] items-center gap-3 border-b border-[#E2E6EC] px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-[#F1F4F8] ${
        clearing ? 'bg-[#F7F9FB]' : ''
      }`}
    >
      <GradeBadge grade={alarm.grade} />

      <span className="truncate text-[16px] font-semibold text-[#1C2430]">
        {school ? school.name : '학교 정보 없음'}
      </span>

      <span className="truncate text-[15px] text-[#5A6473]">{zone ? zone.kind : '—'}</span>

      {metric ? (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-[15px] text-[#5A6473]">{metric.label}</span>
          <span
            className="shrink-0 font-mono text-[17px] font-bold tabular-nums"
            style={{ color: GRADE_COLOR[metric.grade] }}
          >
            {metric.value.toFixed(metric.decimals)}
          </span>
          <span className="shrink-0 text-[13px] text-[#5A6473]">{metric.unit}</span>
          <span
            className="shrink-0 text-[13px] font-semibold"
            style={{ color: GRADE_COLOR[metric.grade] }}
          >
            {GRADE_LABEL[metric.grade]}
          </span>
        </span>
      ) : (
        <span className="text-[15px] text-[#5A6473]">—</span>
      )}

      <span className="text-right font-mono text-[15px] tabular-nums text-[#5A6473]">
        {elapsedLabel(alarm.raisedAt, now)}
      </span>

      {clearing ? (
        <span className="text-right text-[14px] font-semibold text-[#0E8F8F]">
          호전 중 · 해제까지{' '}
          <span className="font-mono text-[16px] tabular-nums">{clearLeft}</span>초
        </span>
      ) : (
        <span className="text-right text-[14px] text-[#5A6473]">지속 중</span>
      )}
    </button>
  );
}

interface Props {
  alarms: Alarm[];
  schools: School[];
  now: number;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export default function AlertsPanel({ alarms, schools, now, onClose, onSelect }: Props) {
  // sortAlarms는 받은 배열을 제자리에서 정렬한다. props 배열을 건드리지 않도록 복사해 넘긴다.
  const sorted = sortAlarms([...alarms]);
  const clearingCount = sorted.filter((a) => a.clearingSince !== null).length;
  const holdingCount = sorted.length - clearingCount;

  const schoolById = new Map(schools.map((s) => [s.id, s]));

  // 승격/해제 규칙 문구에 쓸 값 — alarm.ts 상수에서 환산한다(하드코딩 금지).
  const riseText = holdLabel(RISE_HOLD_MS);
  const clearText = holdLabel(CLEAR_HOLD_MS);

  return (
    <PanelShell
      title="알림"
      subtitle={`현재 경보 ${sorted.length}건 · 관측 학교 ${schools.length}개교`}
      onClose={onClose}
      wide
    >
      {/* 1. 상단 요약 */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#E2E6EC] bg-white px-4 py-3">
          <div className="text-[15px] text-[#5A6473]">현재 경보</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-[36px] font-bold leading-none tabular-nums text-[#1C2430]">
              {sorted.length}
            </span>
            <span className="text-[15px] text-[#5A6473]">건</span>
          </div>
        </div>

        <div className="rounded-xl border border-[#E2E6EC] bg-white px-4 py-3">
          <div className="text-[15px] text-[#5A6473]">호전 중 (해제 대기)</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-[36px] font-bold leading-none tabular-nums text-[#0E8F8F]">
              {clearingCount}
            </span>
            <span className="text-[15px] text-[#5A6473]">건</span>
          </div>
        </div>

        <div className="rounded-xl border border-[#E2E6EC] bg-white px-4 py-3">
          <div className="text-[15px] text-[#5A6473]">지속 중</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-mono text-[36px] font-bold leading-none tabular-nums text-[#1C2430]">
              {holdingCount}
            </span>
            <span className="text-[15px] text-[#5A6473]">건</span>
          </div>
        </div>
      </div>

      {/* 2~3. 경보 전체 목록 / 없을 때 안내 */}
      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#E2E6EC] bg-[#F7F9FB] px-6 py-20 text-center">
          <div className="text-[34px] font-bold leading-tight text-[#1C2430]">
            현재 경보 없음 · 전교 정상
          </div>
          <p className="mt-3 text-[15px] text-[#5A6473]">
            모든 학교가 기준표 &lsquo;{GRADE_LABEL.bad}&rsquo; 아래에 있습니다.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E2E6EC]">
          <div className="grid grid-cols-[132px_minmax(150px,1fr)_92px_minmax(230px,1.3fr)_92px_136px] items-center gap-3 border-b border-[#E2E6EC] bg-[#F1F4F8] px-3 py-2 text-[13px] font-semibold text-[#5A6473]">
            <span>등급</span>
            <span>학교</span>
            <span>구역</span>
            <span>가장 나쁜 항목</span>
            <span className="text-right">경과</span>
            <span className="text-right">해제 대기</span>
          </div>

          {sorted.map((a) => (
            <AlarmRow
              key={a.schoolId}
              alarm={a}
              school={schoolById.get(a.schoolId)}
              now={now}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      {/* 4. 경보 규칙 설명 — 숫자는 alarm.ts 상수에서 환산해 넣는다. */}
      <section className="mt-5 rounded-xl border border-[#E2E6EC] bg-[#F7F9FB] px-5 py-4">
        <h3 className="text-[16px] font-bold text-[#1C2430]">경보 규칙</h3>
        <ul className="mt-2.5 space-y-2 text-[15px] leading-relaxed text-[#5A6473]">
          <li>
            <span className="font-semibold text-[#1C2430]">올라올 때 ·</span> 학교의 어느 구역이든
            기준표 등급이 <span className="font-semibold text-[#1C2430]">&lsquo;{GRADE_LABEL.bad}&rsquo; 이상</span>
            (
            {GRADE_LABEL.bad}, {GRADE_LABEL.veryBad})으로{' '}
            <span className="font-mono font-bold tabular-nums text-[#0E8F8F]">{riseText}</span>{' '}
            연속으로 유지되면 경보로 올라옵니다. 순간적으로 한 번 튄 값은 경보가 되지 않습니다.
          </li>
          <li>
            <span className="font-semibold text-[#1C2430]">내려갈 때 ·</span> 값이 기준 아래로
            돌아오면 바로 닫지 않고 &lsquo;호전 중&rsquo;으로 바뀌며, 그 상태가{' '}
            <span className="font-mono font-bold tabular-nums text-[#0E8F8F]">{clearText}</span>{' '}
            유지되면 자동으로 해제됩니다. 대기 중에 다시 나빠지면 남은 시간은 초기화되고 경보가
            이어집니다.
          </li>
          <li>
            <span className="font-semibold text-[#1C2430]">정렬 ·</span> {GRADE_LABEL.veryBad}을
            먼저, 같은 등급이면 오래된 경보를 먼저 보여줍니다.
          </li>
          <li>
            <span className="font-semibold text-[#1C2430]">지도 화면과의 차이 ·</span> 지도 위
            자동 팝업은 화면을 덮지 않도록 최대{' '}
            <span className="font-mono font-bold tabular-nums text-[#1C2430]">{MAX_POPUPS}</span>
            개까지만 띄웁니다. 이 목록은 가려진 경보까지 전부 담습니다.
          </li>
          <li>
            <span className="font-semibold text-[#1C2430]">판정 항목 ·</span> 경보는 기준표 6항목
            (PM10, PM2.5, CO₂, VOC, HCHO, CO)으로만 판정합니다. 온도·습도는 기준표에 없어 경보
            사유가 되지 않습니다.
          </li>
        </ul>
        <p className="mt-3 border-t border-[#E2E6EC] pt-2.5 text-[13px] text-[#5A6473]">
          이 화면은 읽기 전용입니다. 경보를 끄거나 확인 처리하는 기능은 없고, 조건이 풀리면 위
          규칙에 따라 자동으로 사라집니다.
        </p>
      </section>
    </PanelShell>
  );
}
