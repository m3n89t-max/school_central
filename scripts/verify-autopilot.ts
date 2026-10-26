/**
 * 오토파일럿 시나리오 검증.
 *
 * 화면을 띄워 15초씩 기다리며 눈으로 확인하는 것은 느리고, 60초 재개 같은
 * 긴 조건은 사실상 확인이 안 된다. 그래서 시각을 가짜로 흘려 전체 시나리오를
 * 돌린다. 실패하면 비정상 종료한다.
 *
 * 실행: npx tsx scripts/verify-autopilot.ts
 */

import {
  DWELL_MS,
  RESUME_MS,
  createAutopilot,
  interact,
  stepAutopilot,
  autopilotLabel,
} from '../src/lib/autopilot';
import type { Alarm } from '../src/lib/alarm';

let failed = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** 경보 한 건을 흉내 낸다. 오토파일럿은 schoolId와 순서만 본다. */
function alarm(schoolId: string): Alarm {
  return {
    schoolId,
    grade: 'veryBad',
    raisedAt: 0,
    clearingSince: null,
  } as Alarm;
}

console.log('\n[1] 전교 정상이면 전체 지도에 머문다');
{
  let s = createAutopilot(0);
  s = stepAutopilot(s, [], 1_000);
  check('phase=overview', s.phase === 'overview', s.phase);
  check('focusId 없음', s.focusId === null);

  // 한참 지나도 그대로여야 한다
  s = stepAutopilot(s, [], 600_000);
  check('10분 뒤에도 overview', s.phase === 'overview', s.phase);
  check('라벨이 정상 상태를 알림', autopilotLabel(s, 0, 600_000).includes('전교 정상'));
}

console.log('\n[2] 문제 학교가 생기면 확대해서 비춘다');
{
  let s = createAutopilot(0);
  const list = [alarm('A'), alarm('B')];
  s = stepAutopilot(s, list, 1_000);
  check('phase=focus', s.phase === 'focus', s.phase);
  check('가장 나쁜 A부터', s.focusId === 'A', String(s.focusId));
}

console.log('\n[3] 15초가 지나면 다음 학교로 넘어간다');
{
  let s = createAutopilot(0);
  const list = [alarm('A'), alarm('B'), alarm('C')];
  s = stepAutopilot(s, list, 0);
  check('A를 비춤', s.focusId === 'A', String(s.focusId));

  // 머무는 시간이 차기 전에는 안 바뀐다
  s = stepAutopilot(s, list, DWELL_MS - 1);
  check('14.9초엔 그대로 A', s.focusId === 'A', String(s.focusId));

  s = stepAutopilot(s, list, DWELL_MS);
  check('15초에 B로 이동', s.focusId === 'B', String(s.focusId));

  s = stepAutopilot(s, list, DWELL_MS * 2);
  check('다시 15초 뒤 C로 이동', s.focusId === 'C', String(s.focusId));
}

console.log('\n[4] 한 바퀴를 다 돌면 전체 지도를 한 번 보여준다');
{
  let s = createAutopilot(0);
  const list = [alarm('A'), alarm('B')];
  s = stepAutopilot(s, list, 0);           // A
  s = stepAutopilot(s, list, DWELL_MS);    // B
  check('B까지 비춤', s.focusId === 'B', String(s.focusId));

  s = stepAutopilot(s, list, DWELL_MS * 2);
  check('한 바퀴 뒤 overview', s.phase === 'overview', s.phase);
  check('방문 기록 비움', s.visited.length === 0);

  // 다음 틱에 새 바퀴가 시작된다
  s = stepAutopilot(s, list, DWELL_MS * 2 + 1);
  check('새 바퀴는 다시 A부터', s.focusId === 'A', String(s.focusId));
}

console.log('\n[5] 같은 학교를 연속으로 반복하지 않는다');
{
  let s = createAutopilot(0);
  const list = [alarm('A'), alarm('B'), alarm('C')];
  const seen: string[] = [];
  let t = 0;
  for (let i = 0; i < 3; i += 1) {
    s = stepAutopilot(s, list, t);
    if (s.focusId) seen.push(s.focusId);
    t += DWELL_MS;
  }
  check('세 학교를 모두 비춤', new Set(seen).size === 3, seen.join(','));
}

console.log('\n[6] 비추던 학교가 호전되면 기다리지 않고 넘어간다');
{
  let s = createAutopilot(0);
  const before = [alarm('A'), alarm('B')];
  s = stepAutopilot(s, before, 0);
  check('A를 비추는 중', s.focusId === 'A', String(s.focusId));

  // A가 호전돼 목록에서 빠졌다. 아직 15초가 안 됐지만 넘어가야 한다.
  const after = [alarm('B')];
  s = stepAutopilot(s, after, 3_000);
  check('즉시 B로 이동', s.focusId === 'B', String(s.focusId));
  check('머문 시각 갱신', s.since === 3_000, String(s.since));
}

console.log('\n[7] 모든 학교가 호전되면 전체 지도로 돌아간다');
{
  let s = createAutopilot(0);
  s = stepAutopilot(s, [alarm('A')], 0);
  check('A를 비추는 중', s.focusId === 'A', String(s.focusId));

  s = stepAutopilot(s, [], 2_000);
  check('overview로 복귀', s.phase === 'overview', s.phase);
  check('focusId 해제', s.focusId === null);
}

console.log('\n[8] 조작하면 즉시 멈추고 60초 뒤 재개한다');
{
  let s = createAutopilot(0);
  const list = [alarm('A'), alarm('B')];
  s = stepAutopilot(s, list, 0);
  check('A를 비추는 중', s.focusId === 'A', String(s.focusId));

  s = interact(s, 5_000);
  check('즉시 멈춤', s.phase === 'paused', s.phase);
  check('확대 해제', s.focusId === null);

  // 멈춘 동안에는 시간이 흘러도 안 움직인다
  s = stepAutopilot(s, list, 5_000 + DWELL_MS * 3);
  check('멈춘 동안 그대로', s.phase === 'paused', s.phase);

  s = stepAutopilot(s, list, 5_000 + RESUME_MS - 1);
  check('59.9초엔 아직 멈춤', s.phase === 'paused', s.phase);

  s = stepAutopilot(s, list, 5_000 + RESUME_MS);
  check('60초에 재개', s.phase === 'overview', s.phase);

  s = stepAutopilot(s, list, 5_000 + RESUME_MS + 1);
  check('재개 후 순회 시작', s.phase === 'focus', s.phase);
}

console.log('\n[9] 조작이 이어지면 계속 멈춰 있다');
{
  let s = createAutopilot(0);
  const list = [alarm('A')];
  s = stepAutopilot(s, list, 0);
  s = interact(s, 1_000);

  // 50초마다 계속 조작 — 재개되면 안 된다
  for (let t = 51_000; t <= 300_000; t += 50_000) {
    s = stepAutopilot(s, list, t);
    check(`${t / 1000}초: 멈춤 유지`, s.phase === 'paused', s.phase);
    s = interact(s, t);
  }
}

console.log('\n[10] 라벨이 남은 시간을 알려준다');
{
  let s = createAutopilot(0);
  const list = [alarm('A'), alarm('B')];
  s = stepAutopilot(s, list, 0);
  const focusLabel = autopilotLabel(s, 2, 5_000);
  check('순회 중 남은 시간 표시', focusLabel.includes('10초'), focusLabel);

  s = interact(s, 10_000);
  const pauseLabel = autopilotLabel(s, 2, 20_000);
  check('멈춤 중 재개까지 표시', pauseLabel.includes('50초'), pauseLabel);
}

console.log(`\n${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}\n`);
process.exit(failed === 0 ? 0 : 1);
