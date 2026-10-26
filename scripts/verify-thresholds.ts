/**
 * 기준표 대조 검증 — 2026-10-26 대표님 재첨부본(md5 9ecd3622d6…) 기준.
 *
 * 상수가 맞는 것과 판정이 맞는 것은 다르다. metricGrade()에 각 단계의
 * 양끝 값을 직접 넣어 기준표가 지정한 단계가 나오는지 확인한다.
 * 경계 한 칸 차이(>= 대 >)가 여기서 걸린다.
 */
import { metricGrade, gradeBlinks, GRADE_COLOR } from '../src/lib/thresholds';
import type { Grade, JudgedMetric } from '../src/lib/thresholds';

const cases: [JudgedMetric, number, Grade][] = [["pm25", 0, "veryGood"], ["pm25", 35, "veryGood"], ["pm25", 36, "good"], ["pm25", 75, "good"], ["pm25", 76, "normal"], ["pm25", 99, "normal"], ["pm25", 100, "bad"], ["pm25", 109, "bad"], ["pm25", 110, "veryBad"], ["pm25", 200, "veryBad"], ["pm10", 0, "veryGood"], ["pm10", 80, "veryGood"], ["pm10", 81, "good"], ["pm10", 149, "good"], ["pm10", 150, "normal"], ["pm10", 199, "normal"], ["pm10", 200, "bad"], ["pm10", 219, "bad"], ["pm10", 220, "veryBad"], ["pm10", 400, "veryBad"], ["co2", 0, "veryGood"], ["co2", 1000, "veryGood"], ["co2", 1001, "good"], ["co2", 1500, "good"], ["co2", 1501, "normal"], ["co2", 2000, "normal"], ["co2", 2001, "bad"], ["co2", 2199, "bad"], ["co2", 2200, "veryBad"], ["co2", 3000, "veryBad"], ["voc", 0, "veryGood"], ["voc", 600, "veryGood"], ["voc", 601, "good"], ["voc", 1000, "good"], ["voc", 1001, "normal"], ["voc", 1500, "normal"], ["voc", 1501, "bad"], ["voc", 2000, "bad"], ["voc", 2001, "veryBad"], ["voc", 3000, "veryBad"], ["hcho", 0, "veryGood"], ["hcho", 80, "veryGood"], ["hcho", 81, "good"], ["hcho", 130, "good"], ["hcho", 131, "normal"], ["hcho", 199, "normal"], ["hcho", 200, "bad"], ["hcho", 499, "bad"], ["hcho", 500, "veryBad"], ["hcho", 700, "veryBad"], ["co", 1, "veryGood"], ["co", 10, "veryGood"], ["co", 11, "good"], ["co", 20, "good"], ["co", 21, "normal"], ["co", 24, "normal"], ["co", 25, "bad"], ["co", 26, "bad"], ["co", 27, "veryBad"], ["co", 50, "veryBad"]] as [JudgedMetric, number, Grade][];

let fail = 0;
for (const [k, v, want] of cases) {
  const got = metricGrade(k, v);
  if (got !== want) {
    console.log(`FAIL ${k} ${v} -> ${got} (기대 ${want})`);
    fail++;
  }
}
console.log(`경계 검증 ${cases.length}건 중 실패 ${fail}건`);
console.log(`매우나쁨 점멸=${gradeBlinks('veryBad')} 나쁨 점멸=${gradeBlinks('bad')}`);
console.log(`색 나쁨=${GRADE_COLOR.bad} 매우나쁨=${GRADE_COLOR.veryBad}`);
