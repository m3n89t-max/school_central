/**
 * 오토파일럿 — 스스로 움직이는 관제 화면.
 *
 * 이 화면은 교육청 본청의 큰 모니터에 종일 떠 있고, 사람은 조금 떨어진 곳에서
 * 간헐적으로 쳐다본다. 마우스를 잡고 들여다보는 건 상세·과거 조회를 할 때뿐이다.
 * 그래서 **아무도 조작하지 않아도 화면이 알아서 돌아야 한다.**
 *
 * 동작(2026-10-23 대표님 확정):
 *   1. 문제 학교가 생기면 지도가 그 학교로 확대되고 그래프 팝업이 뜬다
 *   2. 한 학교를 15초 보여주고 다음 문제 학교로 넘어간다
 *   3. 문제 학교가 모두 사라지면 전체 지도로 돌아가 조용히 머문다
 *   4. 관제자가 조작하면 즉시 멈추고, 60초간 조작이 없으면 자동 재개
 *
 * 왜 이 모듈이 따로 있나: 화면 전환 판단과 그리기를 섞으면 "지금 왜 이 학교가
 * 떴는지"를 추적할 수 없다. 여기서는 **상태만 계산**하고 그리기는 화면이 맡는다.
 * 덕분에 아래 verify 스크립트로 시간을 가짜로 흘려 전체 시나리오를 검증할 수 있다.
 */

import type { Alarm } from './alarm';

/** 한 학교를 비추는 시간. 그래프를 읽기 충분하면서 순환이 답답하지 않은 길이. */
export const DWELL_MS = 15_000;

/**
 * 조작이 끊긴 뒤 자동 순환을 재개하기까지의 시간.
 *
 * 짧으면 상세를 들여다보는 중에 화면이 제멋대로 움직이고,
 * 길면 자리를 뜬 뒤에도 멈춘 화면이 남는다. 1분이 그 사이다.
 */
export const RESUME_MS = 60_000;

/**
 * 확대할 때 쓰는 카카오맵 레벨. 작을수록 가깝다.
 *
 * 2026-10-23 대표님 지시로 5 → 3으로 더 당겼다. 레벨 5는 축척 250m라
 * 학교가 동네 속 한 점으로 보여, 멀리서 보면 어느 건물인지 분간이 안 된다.
 * 레벨 3(약 100m)이면 학교 부지가 화면에서 또렷하게 잡힌다.
 */
export const FOCUS_LEVEL = 3;

export type AutopilotPhase =
  /** 전체 지도. 문제 학교가 없거나 아직 한 바퀴를 시작하지 않은 상태. */
  | 'overview'
  /** 한 학교를 확대해 비추는 중. */
  | 'focus'
  /** 사람이 조작해서 멈춘 상태. */
  | 'paused';

export interface AutopilotState {
  phase: AutopilotPhase;
  /** 지금 비추는 학교. overview·paused일 때는 null. */
  focusId: string | null;
  /** 현재 국면에 들어선 시각(ms). 머무는 시간을 재는 기준. */
  since: number;
  /** 마지막 조작 시각(ms). 재개 판단에 쓴다. */
  lastInteraction: number;
  /**
   * 이번 바퀴에서 이미 비춘 학교들.
   *
   * 경보 목록은 5초마다 새로 만들어지고 순서도 흔들린다. 그냥 앞에서부터
   * 고르면 같은 학교만 반복해서 비출 수 있다. 비춘 학교를 기억해 한 바퀴를
   * 보장하고, 다 돌면 비운다.
   */
  visited: string[];
}

export function createAutopilot(now = 0): AutopilotState {
  return {
    phase: 'overview',
    focusId: null,
    since: now,
    lastInteraction: 0,
    visited: [],
  };
}

/**
 * 사람이 조작했다. 즉시 멈춘다.
 *
 * 멈춤 자체보다 **왜 멈췄는지**가 중요하다. 관제자가 특정 학교를 들여다보는
 * 중에 화면이 다음 학교로 넘어가면 그건 고장으로 느껴진다.
 */
export function interact(s: AutopilotState, now: number): AutopilotState {
  return { ...s, phase: 'paused', focusId: null, since: now, lastInteraction: now };
}

/**
 * 다음에 비출 학교를 고른다.
 *
 * 아직 안 비춘 학교 중 가장 나쁜 쪽부터. 다 비췄으면 null을 돌려
 * 호출부가 한 바퀴를 끝내게 한다.
 */
function pickNext(alarms: Alarm[], visited: string[]): string | null {
  const rest = alarms.filter((a) => !visited.includes(a.schoolId));
  if (rest.length === 0) return null;
  // 경보 목록은 이미 심각도 순으로 정렬돼 들어온다. 그 순서를 존중한다.
  return rest[0].schoolId;
}

/**
 * 한 틱 진행. 화면은 이 결과를 그대로 그리기만 하면 된다.
 *
 * @param alarms 현재 경보 목록(심각도 순). 비어 있으면 전교 정상.
 * @param now    현재 시각(ms)
 */
export function stepAutopilot(
  s: AutopilotState,
  alarms: Alarm[],
  now: number,
): AutopilotState {
  // --- 멈춤 상태: 조작이 끊긴 지 충분히 지났는지만 본다 ---
  if (s.phase === 'paused') {
    if (now - s.lastInteraction < RESUME_MS) return s;
    // 재개한다. 한 바퀴를 새로 시작해 멈춰 있던 동안의 변화를 반영한다.
    return { ...s, phase: 'overview', focusId: null, since: now, visited: [] };
  }

  // --- 문제 학교가 없다: 전체 지도로 돌아가 머문다 ---
  if (alarms.length === 0) {
    if (s.phase === 'overview' && s.focusId === null) return s;
    return { ...s, phase: 'overview', focusId: null, since: now, visited: [] };
  }

  const live = alarms.map((a) => a.schoolId);

  // --- 비추던 학교가 호전돼 목록에서 빠졌다: 기다리지 않고 바로 넘어간다 ---
  if (s.phase === 'focus' && s.focusId !== null && !live.includes(s.focusId)) {
    const visited = s.visited.filter((id) => live.includes(id));
    const next = pickNext(alarms, visited);
    if (next === null) {
      return { ...s, phase: 'overview', focusId: null, since: now, visited: [] };
    }
    return { ...s, phase: 'focus', focusId: next, since: now, visited: [...visited, next] };
  }

  // --- 전체 지도에서 문제를 발견했다: 첫 학교로 확대 ---
  if (s.phase === 'overview') {
    const next = pickNext(alarms, s.visited);
    if (next === null) {
      // 한 바퀴를 다 돌았다. 비우고 다음 틱에 새 바퀴를 시작한다.
      return { ...s, visited: [], since: now };
    }
    return { ...s, phase: 'focus', focusId: next, since: now, visited: [...s.visited, next] };
  }

  // --- 비추는 중: 머무는 시간이 찼는지 본다 ---
  if (now - s.since < DWELL_MS) return s;

  const next = pickNext(alarms, s.visited);
  if (next === null) {
    // 한 바퀴 완료. 전체 지도를 한 번 보여주고 다시 시작한다 —
    // 쉼 없이 학교만 돌면 전체 현황을 볼 틈이 없다.
    return { ...s, phase: 'overview', focusId: null, since: now, visited: [] };
  }
  return { ...s, phase: 'focus', focusId: next, since: now, visited: [...s.visited, next] };
}

/** 화면 우상단에 띄울 안내 문구. 지금 왜 이 화면인지 관제자가 알아야 한다. */
export function autopilotLabel(s: AutopilotState, alarmCount: number, now: number): string {
  if (s.phase === 'paused') {
    const left = Math.max(0, Math.ceil((RESUME_MS - (now - s.lastInteraction)) / 1000));
    return `수동 조작 중 · ${left}초 후 자동 재개`;
  }
  if (s.phase === 'focus') {
    const left = Math.max(0, Math.ceil((DWELL_MS - (now - s.since)) / 1000));
    return `자동 순회 · ${left}초 후 다음 학교`;
  }
  return alarmCount === 0 ? '전교 정상 · 자동 감시 중' : '전체 지도 · 곧 순회를 시작합니다';
}
