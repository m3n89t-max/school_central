/**
 * 경보 수명주기 검증 — lib/alarm.ts를 실제로 불러 돌린다.
 * 로직을 복제하지 않고 원본 모듈을 쓰는 것이 핵심이다.
 *   npx tsx scripts/verify-alarm.ts
 */
import {
  createAlarmState,
  stepAlarms,
  RISE_HOLD_MS,
  CLEAR_HOLD_MS,
  gridColumns,
  MAX_POPUPS,
} from '../src/lib/alarm';
import type { School, Reading, Zone } from '../src/lib/types';

function school(id: string, pm25: number): School {
  const reading: Reading = {
    pm25,
    pm10: 50,
    co2: 700,
    co: 2,
    hcho: 30,
    temp: 28,
    humidity: 60,
    voc: 200,
  };
  const zone: Zone = { id: `${id}-조리실`, kind: '조리실', reading, status: 'normal' };
  return {
    id,
    name: id,
    city: '제주시',
    region: '테스트',
    lat: 33.5,
    lng: 126.5,
    zones: [zone],
    status: 'normal',
  };
}

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

// 기준표 PM2.5 경계: 보통 76 / 나쁨 100 / 매우나쁨 110.
// 등급을 갈라 쓰려면 이 경계를 지켜야 한다 — 120은 이미 '매우나쁨'이다.
const BAD = 105; // 나쁨 구간(100~109)
const VERY_BAD = 250; // 매우나쁨 구간(110↑)
const OK = 50; // 매우좋음
const st = createAlarmState();
let t = 1_000_000;

check('초기 경보 없음', stepAlarms(st, [school('A', OK)], t).length, 0);

// 나쁨 진입 — 즉시 뜨지 않아야 한다(RISE_HOLD).
t += 1000;
check('나쁨 진입 직후 미승격', stepAlarms(st, [school('A', BAD)], t).length, 0);

// RISE_HOLD 경과 전
t += RISE_HOLD_MS - 2000;
check('RISE_HOLD 직전 미승격', stepAlarms(st, [school('A', BAD)], t).length, 0);

// RISE_HOLD 경과 후 승격
t += 3000;
const risen = stepAlarms(st, [school('A', BAD)], t);
check('RISE_HOLD 경과 후 승격', risen.length, 1);
check('승격 등급', risen[0]?.grade, 'bad');

// 승격 도중 스파이크로 정상 복귀 — 즉시 닫히면 안 된다(CLEAR_HOLD).
t += 5000;
const clearing = stepAlarms(st, [school('A', OK)], t);
check('호전 직후에도 유지', clearing.length, 1);
check('해제 대기 진입', clearing[0]?.clearingSince !== null, true);

// 다시 나빠지면 해제 대기가 취소돼야 한다.
t += 5000;
const recov = stepAlarms(st, [school('A', VERY_BAD)], t);
check('재악화 시 해제 대기 취소', recov[0]?.clearingSince, null);
check('등급 갱신(매우나쁨)', recov[0]?.grade, 'veryBad');

// 다시 호전 후 CLEAR_HOLD 경과 → 닫힘
t += 1000;
stepAlarms(st, [school('A', OK)], t);
t += CLEAR_HOLD_MS - 2000;
check('CLEAR_HOLD 직전 유지', stepAlarms(st, [school('A', OK)], t).length, 1);
t += 3000;
check('CLEAR_HOLD 경과 후 자동 해제', stepAlarms(st, [school('A', OK)], t).length, 0);

// 깜빡임 억제 — 경계에서 출렁여도 뜨지 않아야 한다.
const st2 = createAlarmState();
let t2 = 2_000_000;
let flickered = 0;
for (let i = 0; i < 20; i++) {
  t2 += 5000; // 5초 주기
  const v = i % 2 === 0 ? BAD : OK; // 나쁨/정상 반복
  if (stepAlarms(st2, [school('B', v)], t2).length > 0) flickered++;
}
check('경계 출렁임에도 미승격', flickered, 0);

// 정렬 — 늦게 뜬 매우나쁨이 먼저 온 나쁨보다 앞서야 한다.
const st3 = createAlarmState();
let t3 = 3_000_000;
const many = [school('C', BAD), school('D', VERY_BAD)];
stepAlarms(st3, many, t3);
t3 += RISE_HOLD_MS + 1000;
const sorted = stepAlarms(st3, many, t3);
check('둘 다 승격', sorted.length, 2);
check('매우나쁨 우선 정렬', sorted[0]?.schoolId, 'D');
check('나쁨은 뒤로', sorted[1]?.schoolId, 'C');

// 격자 열 수
check('팝업 1개 → 1열', gridColumns(1), 1);
check('팝업 2개 → 2열', gridColumns(2), 2);
check('팝업 4개 → 2열(2x2)', gridColumns(4), 2);
check('팝업 6개 → 3열', gridColumns(6), 3);
check('팝업 상한', MAX_POPUPS, 6);

console.log(`\n합계: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
