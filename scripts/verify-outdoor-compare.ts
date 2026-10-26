/**
 * outdoorCompare.ts 검증 — 로직을 복제하지 않고 원본 모듈을 불러 돌린다.
 *   npx tsx scripts/verify-outdoor-compare.ts
 *
 * 네 가지 경우를 실제 실행해 기대 판정이 나오는지 확인한다.
 */
import {
  compareIndoorOutdoor,
  describeOutdoorCompare,
  DIRTY_LEVEL,
  RATIO_SIMILAR,
  RATIO_FILTER_OK,
  RATIO_INDOOR_DOMINANT,
  VERDICT_LABEL,
  type OutdoorCompareVerdict,
} from '../src/lib/outdoorCompare';
import type { Reading } from '../src/lib/types';
import type { OutdoorReading } from '../src/lib/outdoor';

/** PM 외 항목은 비교 대상이 아니므로 아무 값이나 둬도 판정이 바뀌지 않아야 한다. */
function indoor(pm10: number, pm25: number): Reading {
  return { pm25, pm10, co2: 1800, co: 3, hcho: 40, temp: 29, humidity: 62, voc: 900 };
}

function outdoor(pm10: number, pm25: number): OutdoorReading {
  return { pm10, pm25, temp: 24.5, humidity: 68 };
}

let pass = 0;
let fail = 0;

function check(
  title: string,
  ind: Reading,
  out: OutdoorReading,
  expected: OutdoorCompareVerdict,
) {
  const r = compareIndoorOutdoor(ind, out);
  const ok = r.verdict === expected;
  ok ? pass++ : fail++;
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${title}`);
  console.log(`  입력      실외 pm10=${out.pm10} pm25=${out.pm25} / 실내 pm10=${ind.pm10} pm25=${ind.pm25}`);
  console.log(`  기대      ${expected} (${VERDICT_LABEL[expected]})`);
  console.log(`  판정      ${r.verdict} (${VERDICT_LABEL[r.verdict]})  driving=${r.drivingMetric}`);
  console.log(
    `  평균비율  ${r.meanRatio === null ? 'null' : r.meanRatio.toFixed(3)}   필터판정가능=${r.filterAssessable}`,
  );
  for (const m of r.metrics) {
    console.log(
      `   - ${m.metric.padEnd(5)} 실내=${String(m.indoor).padStart(4)} 실외=${String(m.outdoor).padStart(4)}` +
        ` 비율=${m.ratio === null ? 'null' : m.ratio.toFixed(3)} delta=${m.delta}` +
        ` 실내나쁨=${m.indoorDirty} 실외나쁨=${m.outdoorDirty} → ${m.verdict}`,
    );
  }
  console.log(`  문장      ${describeOutdoorCompare(r)}`);
}

console.log('경계값(잠정): DIRTY_LEVEL pm10=%d pm25=%d / RATIO_SIMILAR=%s FILTER_OK=%s INDOOR_DOMINANT=%s',
  DIRTY_LEVEL.pm10, DIRTY_LEVEL.pm25, RATIO_SIMILAR, RATIO_FILTER_OK, RATIO_INDOOR_DOMINANT);

// ── 1. 둘 다 나쁨 + 수준 비슷 → 외기 유입 의심 ──────────────────────
// 실외 PM10 120(나쁨)에 실내 112 → 비율 0.93. 거의 안 걸러졌다.
check('① 둘 다 나쁨·수준 비슷 → 외기 유입 의심', indoor(112, 52), outdoor(120, 56), 'infiltrationSuspect');

// ── 2. 실외 좋음 + 실내만 나쁨 → 실내 발생원 ────────────────────────
// 실외 PM10 24/PM2.5 10(좋음)인데 실내 PM10 140/PM2.5 68.
check('② 실외 좋음·실내만 나쁨 → 실내 발생원', indoor(140, 68), outdoor(24, 10), 'indoorSource');

// ── 3. 실외 나쁨 + 실내 좋음 → 필터 정상 ────────────────────────────
// 실외 PM10 130/PM2.5 58인데 실내 PM10 32/PM2.5 14 → 비율 0.25 내외.
check('③ 실외 나쁨·실내 좋음 → 필터 정상', indoor(32, 14), outdoor(130, 58), 'filterEffective');

// ── 4. 둘 다 좋음 → 정상 ────────────────────────────────────────────
check('④ 둘 다 좋음 → 정상', indoor(26, 11), outdoor(30, 13), 'clear');

// ── 보조 확인 ───────────────────────────────────────────────────────
// 실외도 나쁜데 실내가 실외의 2배 이상 → 조리 등 실내 발생원이 우세.
check('⑤ 실외 나쁨·실내가 2배 이상 → 실내 발생원(조리 가정)', indoor(300, 130), outdoor(100, 45), 'indoorSource');

// 회색지대(비율 0.5~0.7) → 판단 유보.
check('⑥ 비율 회색지대 → 판단 유보', indoor(72, 32), outdoor(120, 54), 'indeterminate');

console.log(`\n────────────\n결과: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exitCode = 1;
