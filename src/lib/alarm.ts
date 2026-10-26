import type { School } from './types';
import { readingGrade, worstGrade } from './thresholds';
import type { Grade } from './thresholds';

/**
 * 자동 팝업 경보의 수명주기.
 *
 * 왜 즉시 띄우고 즉시 닫지 않는가 —
 * 임계값 경계에서 값이 출렁이면 팝업이 깜빡여 관제실에서 못 쓴다.
 * 경기도교육청 매뉴얼 40쪽도 단계 판정을 순간값으로 하지 않는다:
 *   2단계 "15분 모니터링 기준값 이상", 3단계 "2배 초과가 30분간 유지".
 * 같은 취지로 뜰 때(RISE)와 닫힐 때(CLEAR) 모두 지속 조건을 건다.
 *
 * 목업은 5초마다 새 값이 나온다. 실데이터 주기가 확정되면 아래 두 상수를
 * 분 단위로 환산해 다시 맞춘다 — 현재 값은 데모용이다.
 */

/** 경보로 승격되기까지 연속으로 '나쁨 이상'이어야 하는 시간. */
export const RISE_HOLD_MS = 10_000;

/**
 * 정상 복귀 후 팝업이 닫히기까지 유지돼야 하는 시간.
 * 대표님 지시 전까지의 잠정값 — 3분이면 관제 반응성과 깜빡임 억제가 모두 선다.
 */
export const CLEAR_HOLD_MS = 180_000;

/** 화면을 덮지 않도록 동시에 띄우는 팝업 수를 제한한다. 넘치면 '외 N개'로 접는다. */
export const MAX_POPUPS = 6;

/** 경보 승격 기준 등급. 기준표에서 빨강(240.0.0)이 시작되는 '나쁨'부터다. */
function isAlarming(g: Grade): boolean {
  return g === 'bad' || g === 'veryBad';
}

export interface Alarm {
  schoolId: string;
  /** 경보 등급 — 나쁨 또는 매우나쁨. */
  grade: Grade;
  /** 경보가 올라온 시각. 정렬과 경과 시간 표시에 쓴다. */
  raisedAt: number;
  /** 호전되어 해제 대기에 들어간 시각. 아직 호전 전이면 null. */
  clearingSince: number | null;
}

/** 경보 추적 상태. 컴포넌트 밖에서 ref로 들고 다닌다. */
export interface AlarmState {
  /** 현재 떠 있는 경보. */
  active: Map<string, Alarm>;
  /** 아직 승격되지 않은 후보(연속 조건 충족 대기). */
  pending: Map<string, { since: number; grade: Grade }>;
}

export function createAlarmState(): AlarmState {
  return { active: new Map(), pending: new Map() };
}

/** 학교의 현재 최악 등급. 구역 중 가장 나쁜 쪽을 쓴다. */
export function schoolGrade(school: School): Grade {
  return worstGrade(school.zones.map((z) => readingGrade(z.reading)));
}

/**
 * 한 틱 분량의 상태를 반영하고, 지금 띄워야 할 경보 목록을 돌려준다.
 *
 * state는 제자리에서 변형한다(ref에 담아 쓰는 전제).
 * 반환 배열은 심각도 → 발생 순으로 정렬돼 있다.
 */
export function stepAlarms(state: AlarmState, schools: School[], now: number): Alarm[] {
  const seen = new Set<string>();

  for (const school of schools) {
    seen.add(school.id);
    const grade = schoolGrade(school);
    const alarming = isAlarming(grade);
    const active = state.active.get(school.id);

    if (active) {
      if (alarming) {
        // 계속 나쁨 — 해제 대기를 취소하고 등급만 최신으로.
        active.grade = grade;
        active.clearingSince = null;
      } else if (active.clearingSince === null) {
        // 방금 호전 — 해제 대기 시작. 바로 닫지 않는다.
        active.clearingSince = now;
      } else if (now - active.clearingSince >= CLEAR_HOLD_MS) {
        // 충분히 유지됨 — 닫는다.
        state.active.delete(school.id);
      }
      continue;
    }

    if (!alarming) {
      state.pending.delete(school.id);
      continue;
    }

    // 승격 후보. 연속으로 버텨야 올라간다.
    const pending = state.pending.get(school.id);
    if (!pending) {
      state.pending.set(school.id, { since: now, grade });
    } else {
      pending.grade = grade;
      if (now - pending.since >= RISE_HOLD_MS) {
        state.pending.delete(school.id);
        state.active.set(school.id, {
          schoolId: school.id,
          grade,
          raisedAt: now,
          clearingSince: null,
        });
      }
    }
  }

  // 목록에서 사라진 학교는 추적도 정리한다.
  for (const id of [...state.active.keys()]) if (!seen.has(id)) state.active.delete(id);
  for (const id of [...state.pending.keys()]) if (!seen.has(id)) state.pending.delete(id);

  return sortAlarms([...state.active.values()]);
}

/** 매우나쁨 먼저, 같은 등급이면 오래된 것 먼저. */
export function sortAlarms(alarms: Alarm[]): Alarm[] {
  const rank = (g: Grade) => (g === 'veryBad' ? 0 : 1);
  return alarms.sort((a, b) => rank(a.grade) - rank(b.grade) || a.raisedAt - b.raisedAt);
}

/**
 * 팝업 개수에 맞는 격자 열 수.
 * 1개는 크게, 2개는 가로로, 3~4개는 2x2, 그 이상은 3열로 채운다.
 */
export function gridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 2;
  return 3;
}

/** 경과 시간을 '3분 전' 형태로. */
export function elapsedLabel(from: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - from) / 1000));
  if (sec < 60) return `${sec}초`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분`;
}
