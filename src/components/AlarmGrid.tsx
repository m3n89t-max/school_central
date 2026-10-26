'use client';

import { useEffect, useRef, useState } from 'react';
import type { School } from '@/lib/types';
import type { Alarm } from '@/lib/alarm';
import { CLEAR_HOLD_MS, elapsedLabel, gridColumns } from '@/lib/alarm';
import { GRADE_COLOR, GRADE_LABEL, gradeBlinks, metricGrade, readingGrade } from '@/lib/thresholds';
import type { JudgedMetric } from '@/lib/thresholds';

/**
 * 문제 학교 자동 팝업 격자 — **축소판**.
 *
 * 2026-10-16 대표님 지시로 카드를 줄였다. 팝업이 크면 지도를 덮어
 * 전체 현황이 안 보인다. 축소 카드는 "어느 학교가 얼마나 나쁜가"만 보여주고,
 * 자세한 수치는 카드를 눌러 상세 창(AlarmDetail)에서 본다.
 *
 * 뜨고 닫히는 판정은 lib/alarm.ts가 맡는다 — 여기서는 그리기만 한다.
 *
 * 2026-10-23 대표님 지시 — 교육청 본청 대형 모니터에 종일 띄워두고
 * 조금 떨어진 곳에서 간헐적으로 본다. 카드가 순간적으로 나타나거나
 * 사라지면 관제자가 변화 자체를 놓친다. 그래서
 *   (1) 격자를 좌상단부터 채우고,
 *   (2) 등장/퇴장에 부드러운 애니메이션을 주고,
 *   (3) 여러 장이 동시에 떠도 좌상단부터 한 장씩 차례로 들어오게 한다.
 *
 * 애니메이션은 전역 CSS에 의존하지 않는다 — keyframes를 이 컴포넌트가
 * 직접 <style>로 렌더하는 자족적 구현이다(globals.css는 건드리지 않는다).
 */

/** 축소 카드에 띄울 후보. 기준 초과한 것 우선으로 2개만 고른다. */
const CANDIDATES: Array<{ key: JudgedMetric; label: string }> = [
  { key: 'pm25', label: 'PM2.5' },
  { key: 'pm10', label: 'PM10' },
  { key: 'co2', label: 'CO₂' },
  { key: 'co', label: 'CO' },
  { key: 'hcho', label: 'HCHO' },
  { key: 'voc', label: 'VOC' },
];

const GRADE_RANK: Record<string, number> = { veryBad: 0, bad: 1, normal: 2, good: 3, veryGood: 4 };

/** 등장 애니메이션 길이. */
const ENTER_MS = 280;
/** 퇴장 애니메이션 길이. 이 시간이 지난 뒤에 실제로 unmount한다. */
const EXIT_MS = 320;
/** 카드 사이 등장 지연 — 좌상단부터 차례로 채워지는 느낌을 만든다. */
const STAGGER_MS = 80;
/** 지연이 무한정 늘어나면 마지막 카드가 늦게 뜬다. 상한을 둔다. */
const STAGGER_MAX_STEPS = 5;

/** keyframes 자족 정의. 전역 CSS를 쓰지 않으려고 컴포넌트가 직접 렌더한다. */
const ANIM_CSS = `
@keyframes vaq-alarm-in {
  from { opacity: 0; transform: translate3d(0, 10px, 0) scale(0.97); }
  to   { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
@keyframes vaq-alarm-out {
  from { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
  to   { opacity: 0; transform: translate3d(0, -6px, 0) scale(0.96); }
}
@media (prefers-reduced-motion: reduce) {
  .vaq-alarm-card { animation: none !important; }
}
`;

interface Props {
  alarms: Alarm[];
  schools: School[];
  now: number;
  /** 카드 클릭 — 상세 창을 연다. */
  onOpen: (id: string) => void;
  /** 헤더가 내려와 있으면 경보 카드를 그 아래로 밀어 겹침을 피한다. */
  navOpen?: boolean;
}

/** 퇴장 애니메이션이 끝나기를 기다리는 카드. props에서는 이미 빠진 상태다. */
interface ExitingCard {
  alarm: Alarm;
  school: School;
  /** 사라질 때 자리가 튀지 않게 마지막으로 있던 자리를 기억한다. */
  index: number;
}

function AlarmCard({
  alarm,
  school,
  now,
  onOpen,
  /** 등장 순서. 좌상단이 0. */
  order,
  exiting,
}: {
  alarm: Alarm;
  school: School;
  now: number;
  onOpen: (id: string) => void;
  order: number;
  exiting: boolean;
}) {
  const color = GRADE_COLOR[alarm.grade];
  const clearing = alarm.clearingSince !== null;
  // 해제까지 남은 시간 — 자동으로 닫힌다는 걸 관제자가 알 수 있어야 한다.
  const clearLeft = clearing
    ? Math.max(0, Math.ceil((CLEAR_HOLD_MS - (now - alarm.clearingSince!)) / 1000))
    : 0;

  // 경보 등급을 만든 구역을 대표로.
  const worstZone =
    school.zones.find((z) => readingGrade(z.reading) === alarm.grade) ?? school.zones[0];

  const top = CANDIDATES.map((m) => {
    const v = worstZone.reading[m.key];
    return { ...m, v, g: metricGrade(m.key, v) };
  })
    .sort((a, b) => GRADE_RANK[a.g] - GRADE_RANK[b.g])
    .slice(0, 2);

  /**
   * 등장은 `backwards`로 채운다 — 지연 중엔 from(투명)을 유지하되
   * 끝난 뒤엔 fill을 남기지 않는다. `both`로 두면 최종 opacity:1이
   * 호전 중 흐림(opacity-65)을 덮어버린다.
   * 퇴장은 `both` — 마지막 프레임(투명)을 unmount 직전까지 붙잡아
   * 끝에서 다시 번쩍이는 것을 막는다.
   */
  const animation = exiting
    ? `vaq-alarm-out ${EXIT_MS}ms cubic-bezier(0.4, 0, 1, 1) both`
    : `vaq-alarm-in ${ENTER_MS}ms cubic-bezier(0.16, 1, 0.3, 1) backwards`;

  // 퇴장은 즉시 시작한다. 지연은 등장에만 준다.
  const animationDelay = exiting
    ? '0ms'
    : `${Math.min(order, STAGGER_MAX_STEPS) * STAGGER_MS}ms`;

  return (
    <button
      onClick={() => onOpen(school.id)}
      title="클릭하면 상세 수치를 봅니다"
      className={`vaq-alarm-card flex min-w-0 items-center gap-2.5 rounded-lg border bg-[#12161D] px-2.5 py-2 text-left transition-colors hover:bg-[#171C25] ${
        clearing ? 'opacity-65' : ''
      } ${exiting ? 'pointer-events-none' : ''}`}
      style={{
        borderColor: color,
        boxShadow: '0 4px 14px #0008',
        animation,
        animationDelay,
        willChange: 'opacity, transform',
      }}
    >
      <i
        className={`h-2.5 w-2.5 shrink-0 rounded-full${
          gradeBlinks(alarm.grade) && !clearing ? ' vaq-blink' : ''
        }`}
        style={{ background: color }}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate text-[13px] font-semibold text-[#E6E8EB]">{school.name}</span>
          <span className="shrink-0 text-[10px] font-bold" style={{ color }}>
            {GRADE_LABEL[alarm.grade]}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#5F6875]">
          <span className="shrink-0">{worstZone.kind}</span>
          {top.map((m) => (
            <span key={m.key} className="shrink-0 whitespace-nowrap">
              <span className="text-[#4E5765]">{m.label}</span>{' '}
              <span
                className="font-mono font-semibold"
                style={{ color: m.g === 'bad' || m.g === 'veryBad' ? GRADE_COLOR[m.g] : '#8A929E' }}
              >
                {m.key === 'co' ? m.v.toFixed(1) : m.v}
              </span>
            </span>
          ))}
        </div>
      </div>

      <span className="shrink-0 text-right font-mono text-[10px] leading-tight">
        {clearing ? (
          <span className="text-[#22C55E]">
            호전
            <br />
            {clearLeft}초
          </span>
        ) : (
          <span className="text-[#5F6875]">{elapsedLabel(alarm.raisedAt, now)}</span>
        )}
      </span>
    </button>
  );
}

export default function AlarmGrid({ alarms, schools, now, onOpen, navOpen = false }: Props) {
  /**
   * 퇴장 애니메이션을 위한 unmount 지연.
   *
   * props의 alarms에서 항목이 빠지면 React는 그 카드를 즉시 unmount한다.
   * 그래서 "직전 렌더에 있었는데 이번엔 없는" 경보를 여기 state에 복사해
   * EXIT_MS 동안 더 그려주고, 타이머가 끝나면 비운다.
   * 판정 로직(lib/alarm.ts)은 그대로 두고 표시만 늦추는 방식이다.
   */
  const [exiting, setExiting] = useState<ExitingCard[]>([]);
  /** 직전 렌더에 그려졌던 카드들(학교 객체까지 함께 들고 있어야 퇴장 중에도 그릴 수 있다). */
  const prevRef = useRef<Map<string, ExitingCard>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const prev = prevRef.current;

    const next = new Map<string, ExitingCard>();
    alarms.forEach((a, i) => {
      const school = schools.find((s) => s.id === a.schoolId);
      if (school) next.set(a.schoolId, { alarm: a, school, index: i });
    });

    // props에서 빠진 것 = 해제됨 → 퇴장 대기로 넘긴다.
    const gone: ExitingCard[] = [];
    for (const [id, card] of prev) if (!next.has(id)) gone.push(card);

    // 퇴장 중이었는데 다시 경보로 올라온 것 = 퇴장 취소.
    const revived = new Set<string>();
    for (const id of timersRef.current.keys()) if (next.has(id)) revived.add(id);

    for (const id of revived) {
      clearTimeout(timersRef.current.get(id)!);
      timersRef.current.delete(id);
    }

    for (const card of gone) {
      const id = card.alarm.schoolId;
      const prevTimer = timersRef.current.get(id);
      if (prevTimer) clearTimeout(prevTimer);
      timersRef.current.set(
        id,
        setTimeout(() => {
          timersRef.current.delete(id);
          setExiting((cur) => cur.filter((c) => c.alarm.schoolId !== id));
        }, EXIT_MS),
      );
    }

    if (gone.length > 0 || revived.size > 0) {
      setExiting((cur) => {
        const kept = cur.filter(
          (c) => !revived.has(c.alarm.schoolId) && !gone.some((g) => g.alarm.schoolId === c.alarm.schoolId),
        );
        return [...kept, ...gone].sort((a, b) => a.index - b.index);
      });
    }

    prevRef.current = next;
  }, [alarms, schools]);

  // 언마운트 시 타이머 정리.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  /** 살아있는 카드 + 퇴장 중 카드. 퇴장 중 카드는 마지막 자리에 끼워 넣는다. */
  const live = alarms
    .map((a) => {
      const school = schools.find((s) => s.id === a.schoolId);
      return school ? { alarm: a, school, exiting: false } : null;
    })
    .filter((x): x is { alarm: Alarm; school: School; exiting: false } => x !== null);

  const items: Array<{ alarm: Alarm; school: School; exiting: boolean }> = [...live];
  for (const c of [...exiting].sort((a, b) => a.index - b.index)) {
    if (items.some((i) => i.alarm.schoolId === c.alarm.schoolId)) continue;
    items.splice(Math.min(c.index, items.length), 0, {
      alarm: c.alarm,
      school: c.school,
      exiting: true,
    });
  }

  // 퇴장 중 카드가 남아 있으면 경보가 0개여도 계속 그려야 한다.
  if (items.length === 0) return null;

  // 열 수는 살아있는 카드 기준으로 잡아야 해제 순간에 격자가 요동치지 않는다.
  const cols = gridColumns(Math.max(live.length, 1));

  return (
    // 좌상단 기준: bottom-0 → top-0, 오른쪽 정렬(ml-auto) → 왼쪽 정렬(mr-auto).
    <div
      className={`pointer-events-none absolute inset-x-0 z-30 p-3 transition-[top] duration-200 ${
        navOpen ? 'top-14' : 'top-0'
      }`}
    >
      <style>{ANIM_CSS}</style>
      <div
        className="pointer-events-auto mr-auto grid w-fit max-w-full justify-start justify-items-start gap-2"
        style={{
          // grid-auto-flow: row 기본값 그대로 — 1행을 왼쪽부터 채운 뒤 아래 행으로 내려간다.
          gridTemplateColumns: `repeat(${cols}, minmax(200px, 250px))`,
          gridAutoFlow: 'row',
        }}
      >
        {items.map((it, i) => (
          <AlarmCard
            key={it.alarm.schoolId}
            alarm={it.alarm}
            school={it.school}
            now={now}
            onOpen={onOpen}
            order={i}
            exiting={it.exiting}
          />
        ))}
      </div>
    </div>
  );
}
