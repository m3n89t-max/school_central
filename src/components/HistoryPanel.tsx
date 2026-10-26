'use client';

import { useMemo, useState } from 'react';
import type { School, ZoneKind } from '@/lib/types';
import { buildHistory, groupByDay, HISTORY_DAYS } from '@/lib/history';
import type { HistoryPoint } from '@/lib/history';
import { GRADE_COLOR, GRADE_LABEL, GRADE_THRESHOLDS, REFERENCE_THRESHOLDS } from '@/lib/thresholds';
import type { JudgedMetric, ReferenceMetric } from '@/lib/thresholds';

/**
 * 1주일 시간대별 이력 조회.
 *
 * 세로축 = 7일, 가로축 = 24시간. 칸 하나가 1시간이고 색은 기준표 5단계다.
 * 히트맵으로 둔 이유는 벽면 모니터에서 "언제 나빴는가"를 한눈에 봐야 하기 때문이다.
 * 꺾은선은 멀리서 안 읽힌다.
 *
 * 데이터는 전부 목업이다(중앙관제 DB 미구축). 화면에도 그렇게 적는다.
 */

/**
 * 온도·습도는 기준표에 없는 참고 지표다(judged=false).
 * 히트맵 색은 참고 구간으로 칠하되 '참고'임을 화면에 적는다.
 */
type HistMetric = JudgedMetric | ReferenceMetric;
const METRICS: Array<{ key: HistMetric; label: string; unit: string; judged: boolean }> = [
  { key: 'pm25', label: '초미세먼지', unit: '㎍/㎥', judged: true },
  { key: 'pm10', label: '미세먼지', unit: '㎍/㎥', judged: true },
  { key: 'co2', label: '이산화탄소', unit: 'ppm', judged: true },
  { key: 'co', label: '일산화탄소', unit: 'ppm', judged: true },
  { key: 'hcho', label: '포름알데히드', unit: '㎍/㎥', judged: true },
  { key: 'voc', label: 'VOC', unit: 'ppb', judged: true },
  { key: 'temp', label: '온도', unit: '℃', judged: false },
  { key: 'humidity', label: '습도', unit: '%RH', judged: false },
];

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  schools: School[];
  initialSchoolId: string | null;
  now: Date;
  onClose: () => void;
}

export default function HistoryPanel({ schools, initialSchoolId, now, onClose }: Props) {
  const [schoolId, setSchoolId] = useState(initialSchoolId ?? schools[0]?.id ?? '');
  const [kind, setKind] = useState<ZoneKind>('조리실');
  const [metric, setMetric] = useState<HistMetric>('pm25');
  const [hover, setHover] = useState<HistoryPoint | null>(null);

  const school = schools.find((s) => s.id === schoolId);
  const points = useMemo(() => buildHistory(schoolId, kind, now), [schoolId, kind, now]);
  const days = useMemo(() => groupByDay(points), [points]);

  const meta = METRICS.find((m) => m.key === metric)!;
  const band = meta.judged
    ? GRADE_THRESHOLDS[metric as JudgedMetric]
    : REFERENCE_THRESHOLDS[metric as ReferenceMetric];

  // 요약 — 기간 중 최댓값과 '나쁨 이상' 시간 수.
  const summary = useMemo(() => {
    let max = -Infinity;
    let maxAt: Date | null = null;
    let badHours = 0;
    let cookingBad = 0;
    let offBad = 0;
    for (const p of points) {
      const v = p.reading[metric];
      if (v > max) {
        max = v;
        maxAt = p.at;
      }
      if (v >= band.bad) {
        badHours++;
        if (p.cooking) cookingBad++;
        else offBad++;
      }
    }
    return { max, maxAt, badHours, cookingBad, offBad };
  }, [points, metric, band.bad]);

  function cellColor(p: HistoryPoint): string {
    const v = p.reading[metric];
    if (v >= band.veryBad) return GRADE_COLOR.veryBad;
    if (v >= band.bad) return GRADE_COLOR.bad;
    if (v >= band.normal) return GRADE_COLOR.normal;
    if (v >= band.good) return GRADE_COLOR.good;
    return GRADE_COLOR.veryGood;
  }

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#05070A]/80 p-6">
      <div className="flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-[#232A35] bg-[#0C1015] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#1B2029] px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[15px] font-semibold text-[#E6E8EB]">
              이력 조회 · 최근 {HISTORY_DAYS}일
            </h2>
            <span className="rounded-md border border-[#F5A623]/35 bg-[#F5A623]/10 px-2 py-0.5 text-[11px] text-[#F5A623]">
              목업 데이터
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg px-2 py-1 text-[#79828F] hover:bg-[#161B23] hover:text-[#E6E8EB]"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#1B2029] px-5 py-2.5">
          <select
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="rounded-lg border border-[#232A35] bg-[#12161D] px-2.5 py-1.5 text-[13px] text-[#E6E8EB]"
          >
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {(['조리실', '세척실'] as ZoneKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] ${
                kind === k
                  ? 'border-[#2DE1E1]/45 bg-[#132027] text-[#2DE1E1]'
                  : 'border-[#232A35] text-[#79828F] hover:text-[#C9CFD8]'
              }`}
            >
              {k}
            </button>
          ))}

          <span className="mx-1 h-4 w-px bg-[#232A35]" />

          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-lg border px-2.5 py-1.5 text-[12px] ${
                metric === m.key
                  ? 'border-[#2DE1E1]/45 bg-[#132027] text-[#2DE1E1]'
                  : 'border-[#232A35] text-[#79828F] hover:text-[#C9CFD8]'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
            <span className="text-[#8A929E]">
              기간 최고{' '}
              <b className="font-mono text-[15px] text-[#E6E8EB]">
                {metric === 'co' ? summary.max.toFixed(1) : summary.max}
              </b>{' '}
              <span className="text-[#5F6875]">{meta.unit}</span>
              {summary.maxAt && (
                <span className="ml-1 text-[#5F6875]">
                  ({summary.maxAt.getMonth() + 1}/{summary.maxAt.getDate()}{' '}
                  {String(summary.maxAt.getHours()).padStart(2, '0')}시)
                </span>
              )}
            </span>
            <span className="text-[#8A929E]">
              나쁨 이상{' '}
              <b className="font-mono text-[15px]" style={{ color: GRADE_COLOR.bad }}>
                {summary.badHours}
              </b>
              시간
            </span>
            <span className="text-[#5F6875]">
              조리 중 {summary.cookingBad}시간 · 비조리 {summary.offBad}시간
            </span>
            {summary.offBad > summary.cookingBad && summary.offBad > 0 && (
              <span className="rounded-md border border-[#F5A623]/35 bg-[#F5A623]/10 px-2 py-0.5 text-[11px] text-[#F5A623]">
                비조리 시간대 초과가 더 많음 — 환기설비 점검 권장
              </span>
            )}
          </div>

          {/* 히트맵 */}
          <div className="inline-block min-w-full">
            <div className="mb-1 flex pl-[52px]">
              {Array.from({ length: 24 }, (_, h) => (
                <div
                  key={h}
                  className="flex-1 text-center font-mono text-[9px] text-[#4E5765]"
                  style={{ minWidth: 26 }}
                >
                  {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                </div>
              ))}
            </div>

            {days.map(({ day, points: ps }) => (
              <div key={day.toISOString()} className="mb-[3px] flex items-center">
                <div className="w-[52px] shrink-0 pr-2 text-right font-mono text-[10px] text-[#79828F]">
                  {day.getMonth() + 1}/{day.getDate()}
                  <span className="ml-1 text-[#4E5765]">{DOW[day.getDay()]}</span>
                </div>
                <div className="flex flex-1">
                  {Array.from({ length: 24 }, (_, h) => {
                    const p = ps.find((x) => x.at.getHours() === h);
                    if (!p)
                      return (
                        <div
                          key={h}
                          className="mr-[2px] h-6 flex-1 rounded-[3px] bg-[#11151B]"
                          style={{ minWidth: 26 }}
                        />
                      );
                    const v = p.reading[metric];
                    return (
                      <div
                        key={h}
                        onMouseEnter={() => setHover(p)}
                        onMouseLeave={() => setHover(null)}
                        title={`${day.getMonth() + 1}/${day.getDate()} ${String(h).padStart(2, '0')}시 · ${meta.label} ${metric === 'co' ? v.toFixed(1) : v}${meta.unit}`}
                        className={`mr-[2px] h-6 flex-1 cursor-default rounded-[3px] ${
                          p.cooking ? 'ring-1 ring-inset ring-[#2DE1E1]/35' : ''
                        }`}
                        style={{ background: cellColor(p), minWidth: 26, opacity: p.cooking ? 1 : 0.55 }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[#5F6875]">
            <span className="flex items-center gap-1.5">
              <i className="h-3 w-5 rounded-[3px] ring-1 ring-inset ring-[#2DE1E1]/35 bg-[#2a3038]" />
              조리 시간대(평일 09~12시, 목업 가정)
            </span>
            <span className="h-3 w-px bg-[#232A35]" />
            {(['veryGood', 'good', 'normal', 'bad', 'veryBad'] as const).map((g) => (
              <span key={g} className="flex items-center gap-1.5">
                <i className="h-3 w-5 rounded-[3px]" style={{ background: GRADE_COLOR[g] }} />
                {GRADE_LABEL[g]}
              </span>
            ))}
            <span className="ml-auto">
              기준: {meta.label} 나쁨 {band.bad}
              {meta.unit} 이상
              {!meta.judged && <span className="ml-1 text-[#F5A623]">(기준표 외 참고값)</span>}
            </span>
          </div>

          {hover && (
            <div className="mt-3 rounded-lg border border-[#232A35] bg-[#12161D] px-3 py-2 text-[12px]">
              <span className="font-mono text-[#79828F]">
                {hover.at.getMonth() + 1}/{hover.at.getDate()}{' '}
                {String(hover.at.getHours()).padStart(2, '0')}:00
              </span>
              <span className="ml-2 text-[#5F6875]">{hover.cooking ? '조리 중' : '비조리'}</span>
              <span className="ml-3 font-semibold" style={{ color: GRADE_COLOR[hover.grade] }}>
                {GRADE_LABEL[hover.grade]}
              </span>
              <span className="ml-3 text-[#C9CFD8]">
                {METRICS.map((m) => {
                  const v = hover.reading[m.key];
                  return `${m.label} ${m.key === 'co' ? v.toFixed(1) : v}`;
                }).join(' · ')}
              </span>
            </div>
          )}

          <p className="mt-3 text-[11px] text-[#3E4653]">
            {school?.name} {kind} · 측정값·조리 시간대는 전부 목업이다. 실데이터 연동 시 이 패널의
            데이터 출처만 교체한다.
          </p>
        </div>
      </div>
    </div>
  );
}
