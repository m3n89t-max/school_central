'use client';

import { useEffect, useRef, useState } from 'react';
import type { School } from '@/lib/types';
import {
  GRADE_COLOR,
  GRADE_LABEL,
  gradeBlinks,
  metricGrade,
  readingGrade,
  type Grade,
  type JudgedMetric,
  type ReferenceMetric,
} from '@/lib/thresholds';
import Gauge, { SCHOOL_GAUGE_MAX } from '@/components/Gauge';
import ComfortBar from '@/components/ComfortBar';
import { DWELL_MS } from '@/lib/autopilot';
import {
  pm10Grade,
  pm25Grade,
  GRADE_COLOR as OUTDOOR_COLOR,
  type OutdoorReading,
} from '@/lib/outdoor';

/** 체류 시간(초). 구역 전환 시점을 계산하는 데 쓴다. */
const DWELL_SEC = DWELL_MS / 1000;

/**
 * 자동 순회 팝업 — 오토파일럿이 한 학교로 확대했을 때 그 위에 뜨는 그래프.
 *
 * 2026-10-23 대표님 확정: "지도가 해당 학교로 확대되고 그 위에 그래프 팝업이
 * 뜬다 — 위치와 수치를 함께 본다." 분할 화면도, 전체 화면 그래프도 아니다.
 *
 * 그래서 지도를 완전히 덮지 않는다. 화면 우측에 붙여 확대된 학교 마커가
 * 왼쪽에 남아 보이게 했다. 수치만 보면 어느 학교인지 알 수 없고,
 * 지도만 보면 얼마나 나쁜지 알 수 없다. 둘이 같이 있어야 판단이 된다.
 *
 * 상세 창(AlarmDetail)과 다른 점: 이건 사람이 연 것이 아니라 화면이 스스로
 * 띄운 것이다. 15초 뒤 사라지므로 한눈에 읽히는 양만 올린다. 8항목을 모두
 * 깔면 15초 안에 못 읽으므로, 나쁜 항목부터 4개만 보여준다.
 */

/** 항목 표기. 단위와 소수 자릿수는 학교 현장 화면(vaq2)과 맞춘다. */
const METRICS: {
  key: JudgedMetric | ReferenceMetric;
  label: string;
  unit: string;
  decimals: number;
  judged: boolean;
}[] = [
  { key: 'pm10', label: '미세먼지', unit: '㎍/㎥', decimals: 0, judged: true },
  { key: 'pm25', label: '초미세먼지', unit: '㎍/㎥', decimals: 0, judged: true },
  { key: 'co2', label: 'CO₂', unit: 'ppm', decimals: 0, judged: true },
  { key: 'voc', label: 'VOC', unit: 'ppb', decimals: 0, judged: true },
  { key: 'hcho', label: 'HCHO', unit: '㎍/㎥', decimals: 1, judged: true },
  { key: 'co', label: 'CO', unit: 'ppm', decimals: 1, judged: true },
  { key: 'temp', label: '온도', unit: '℃', decimals: 1, judged: false },
  { key: 'humidity', label: '습도', unit: '%', decimals: 0, judged: false },
];

const RANK: Record<Grade, number> = {
  veryGood: 0,
  good: 1,
  normal: 2,
  bad: 3,
  veryBad: 4,
};

/**
 * 판정 항목 중 팝업에 띄울 개수.
 *
 * 2026-10-23 대표님 지시: "중요한 온도와 습도를 추가해."
 * 온도·습도는 아래에 전용 줄로 항상 띄우므로, 위 게이지는 나쁜 판정 항목
 * 4개를 유지한다. 6개로 늘리면 멀리서 읽을 크기가 안 나온다.
 */
const SHOW_COUNT = 4;

/**
 * 온도·습도. 기준표에 판정 기준이 없어 ComfortBar가 '참고'로 표시한다.
 * 라벨·단위·소수 자릿수는 ComfortBar가 kind로 판단하므로 여기선 키만 쓴다.
 */
const REFERENCE_ROW: { key: ReferenceMetric }[] = [{ key: 'temp' }, { key: 'humidity' }];

/**
 * 창 높이에 맞는 게이지 지름과 배치.
 *
 * 관제실 해상도가 미확인이라 고정 px을 박으면 어딘가에서는 반드시 잘린다.
 * 170px 고정 → 348px 잘림, 창 높이에서 300 빼기 → 192px 잘림,
 * 353 빼기 → 72px 잘림. 머리글·패딩·버튼 높이를 손으로 더하는 방식은
 * 세 번 다 틀렸다. 레이아웃을 조금만 건드려도 그 합이 바뀌기 때문이다.
 *
 * 그래서 계산을 버리고 실제로 잰다. 일단 그린 뒤 본문이 넘쳤으면
 * 넘친 만큼 게이지를 줄이고 다시 잰다. 무인 대시보드라 아무도
 * 스크롤하지 않으므로, 잘린 내용은 없는 것과 같다.
 *
 * 한 칸 = 게이지 지름 + 76(항목명 27 + 등급 27 + 여백 8 + 패딩 12).
 * 2줄은 그 두 배가 필요해 낮은 화면에서는 들어가지 않는다. 자리가
 * 모자라면 1줄 4칸으로 눕힌다 — 숫자를 못 읽을 만큼 줄이느니 가로로
 * 펴는 쪽이 낫다.
 */
/**
 * 구역 카드 안 항목 배치 — 넘치면 2x2를 1줄 4칸으로 눕힌다.
 *
 * 왜 필요한가
 * -----------
 * 2026-10-26에 구역 2개를 좌우로 나란히 놓으면서 세로가 다시 모자랐다.
 * 검증 창(577px)에서 188px이 잘려 CO2·VOC 줄과 온도·습도 막대가 통째로
 * 화면 밖으로 밀렸다. 게이지는 이미 하한(84px)이라 더 줄일 수 없었다.
 *
 * 2x2는 게이지 두 줄이라 세로를 두 배 먹는다. 1줄 4칸으로 눕히면 한 줄로
 * 접혀 세로가 절반이 된다. 가로는 구역 카드 폭이 384px이라 4칸이면
 * 칸당 90px 남짓 — 84px 게이지가 들어간다.
 *
 * 상수로 계산하지 않는다. 머리글·패딩·버튼 높이를 손으로 더하는 방식은
 * 앞서 세 번(348→192→72px) 연속으로 빗나갔다. 실제로 그린 뒤 넘친
 * 만큼만 반응한다.
 */
function useZoneLayout(bodyRef: React.RefObject<HTMLDivElement | null>): {
  size: number;
  cols: number;
  tight: boolean;
} {
  const [layout, setLayout] = useState({ size: 132, cols: 2, tight: false });

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;

    const fit = () => {
      const over = el.scrollHeight - el.clientHeight;
      if (over <= 0) return;

      setLayout((cur) => {
        // 2줄 배치면 넘친 양이 두 줄에 걸쳐 있으므로 절반만 줄이면 된다.
        const shrink = cur.cols === 2 ? Math.ceil(over / 2) : over;
        const next = cur.size - shrink;

        // 110 밑으로 내려가면 2줄을 포기하고 1줄 4칸으로 눕힌다.
        if (cur.cols === 2 && next < 110) return { size: 120, cols: 4, tight: false };

        // 하한 76은 숫자가 읽히는 한계다. 거기까지 줄이고도 남으면
        // 게이지를 더 깎는 대신 위아래 여백에서 회수한다.
        if (next < 76) return { ...cur, size: 76, tight: true };
        return { ...cur, size: next };
      });
    };

    // 레이아웃이 확정된 다음 프레임에 잰다. 같은 틱에 재면 0이 나온다.
    const raf = requestAnimationFrame(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [bodyRef, layout.size, layout.cols, layout.tight]);

  return layout;
}

export default function AutoTourPopup({
  school,
  secondsLeft,
  outdoor,
  onOpenDetail,
}: {
  school: School;
  /** 다음 학교로 넘어가기까지 남은 시간. 화면이 멋대로 바뀌는 게 아님을 알린다. */
  secondsLeft: number;
  /** 이 학교가 속한 권역의 실외 대기질. 없으면 실외 줄을 생략한다. */
  outdoor?: OutdoorReading | null;
  onOpenDetail: (id: string) => void;
}) {
  /*
    두 구역을 나란히 보여준다 — 2026-10-26 대표님 지시로 설계를 바꿨다.

    왜 바꿨나
    ---------
    전에는 15초 체류를 쪼개 조리실 10초 / 세척실 5초로 번갈아 띄웠다.
    대표님이 세 번에 걸쳐 "세척실이 안 나온다"고 지적하셨는데, 원인은
    버그가 아니라 설계였다. 세척실이 뜨는 창이 마지막 5초뿐이라 화면을
    쳐다본 대부분의 순간에 조리실만 보인다. 무인 대시보드는 사람이
    "기다렸다가" 보는 물건이 아니라 지나가며 흘깃 보는 물건이다.
    보일 확률이 3분의 1이면 안 보이는 것과 같다.

    그래서 번갈아 띄우기를 폐기하고 두 구역을 좌우로 나란히 놓는다.
    언제 보더라도 조리실과 세척실이 동시에 있다.

    세로가 모자라지 않나
    --------------------
    전에 세로로 쌓았을 때 1017px이 되어 잘렸다. 이번엔 좌우로 놓고,
    구역당 항목을 2x2 격자로 묶어 세로를 절반으로 접는다. 게이지
    크기는 기존 useGaugeLayout이 실측해서 맞춘다.

    훅은 조기 반환보다 반드시 앞에 있어야 한다. 뒤에 두면 호출 순서가
    렌더마다 달라져 React가 깨진다.
  */
  const bodyRef = useRef<HTMLDivElement>(null);
  const { size: gaugeSize, cols, tight } = useZoneLayout(bodyRef);

  // 나쁜 구역을 왼쪽에 둔다. 팝업이 뜬 이유가 먼저 읽혀야 한다.
  const zones = [...school.zones].sort(
    (a, b) => RANK[readingGrade(b.reading)] - RANK[readingGrade(a.reading)],
  );
  if (zones.length === 0) return null;

  const worst = readingGrade(zones[0].reading);

  return (
    /*
      우측 패널. 50인치 TV에서 멀리 떨어져 보므로 760px을 쓴다
      (2026-10-23 "경고 팝업도 좀 더 크게해줘 멀리서도 육안으로 가능하게").
    */
    <div className="pointer-events-none absolute inset-y-0 right-0 z-40 flex w-[860px] items-stretch p-5">
      <div className="pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 border-[#2A323F] bg-[#0C1015]/96 shadow-2xl backdrop-blur">
        {/* 머리 — 어느 학교이고 왜 떴는지 */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#1B2029] bg-[#12161D] px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span
                className={`inline-block h-7 w-2.5 shrink-0 rounded-sm ${gradeBlinks(worst) ? 'vaq-blink' : ''}`}
                style={{ background: GRADE_COLOR[worst] }}
              />
              <span className="truncate text-[32px] font-bold leading-tight text-[#E6E8EB]">
                {school.name}
              </span>
              <span
                className={`shrink-0 text-[20px] font-bold ${gradeBlinks(worst) ? 'vaq-blink' : ''}`}
                style={{ color: GRADE_COLOR[worst] }}
              >
                {GRADE_LABEL[worst]}
              </span>
            </div>
            <div className="mt-1 pl-[22px] text-[16px] text-[#79828F]">
              {school.city} {school.region}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="rounded-md border border-[#2DE1E1]/40 bg-[#132027] px-3 py-1.5 text-[14px] font-semibold text-[#2DE1E1]">
              자동 순회
            </div>
            <div className="mt-1.5 text-[20px] font-bold tabular-nums text-[#C9CFD8]">
              {secondsLeft}초
            </div>
          </div>
        </div>

        {/*
          실외 대기질 — 2026-10-26 대표님 지시로 추가했다.
          "경고 뜰때는 해당학교 주변의 실외공기질도 함께 나타나게 해줘야해"

          실내만 보면 "나쁘다"는 사실은 알아도 원인을 모른다. 실외가 같이
          나쁘면 외기 유입(필터 의심)이고, 실외가 깨끗한데 실내만 나쁘면
          실내 발생원이다. 두 숫자가 나란히 있어야 그 판단이 선다.

          해상도가 다르다는 점을 반드시 밝힌다. 실외는 1시간 단위 관측소
          값이고 실내는 5초 단위다. 같은 시각의 값처럼 읽으면 안 된다.
        */}
        {outdoor && (
          <div className="flex shrink-0 items-center gap-4 border-b border-[#1B2029] bg-[#0F141B] px-6 py-2.5">
            <span className="shrink-0 text-[15px] font-semibold text-[#8A929E]">학교 주변 실외</span>
            {([
              { label: 'PM10', v: outdoor.pm10, g: pm10Grade(outdoor.pm10), unit: '㎍/㎥' },
              { label: 'PM2.5', v: outdoor.pm25, g: pm25Grade(outdoor.pm25), unit: '㎍/㎥' },
            ] as const).map((o) => (
              <span key={o.label} className="flex items-baseline gap-1.5">
                <span className="text-[14px] text-[#5F6875]">{o.label}</span>
                <span
                  className="font-mono text-[20px] font-bold tabular-nums"
                  style={{ color: OUTDOOR_COLOR[o.g] }}
                >
                  {o.v}
                </span>
                <span className="text-[13px] text-[#5F6875]">{o.unit}</span>
                <span className="text-[14px] font-semibold" style={{ color: OUTDOOR_COLOR[o.g] }}>
                  {o.g}
                </span>
              </span>
            ))}
            <span className="ml-auto shrink-0 text-[13px] text-[#5F6875]">
              실외 1시간 단위 · 실내 5초 단위
            </span>
          </div>
        )}

        {/* 본문 — 구역 2개를 좌우로 */}
        <div
          ref={bodyRef}
          className={`grid min-h-0 flex-1 grid-cols-2 gap-3 overflow-hidden px-5 ${tight ? 'py-1.5' : 'py-3'}`}
        >
          {zones.map((z) => {
            const zg = readingGrade(z.reading);
            const ranked = METRICS.filter((m) => m.judged)
              .map((m) => {
                const value = z.reading[m.key];
                return { ...m, value, grade: metricGrade(m.key as JudgedMetric, value) };
              })
              .sort((a, b) => RANK[b.grade] - RANK[a.grade])
              .slice(0, SHOW_COUNT);

            return (
              <div
                key={z.id}
                className={`flex min-h-0 flex-col rounded-xl border bg-[#0F1319]/70 ${tight ? 'p-2' : 'p-3'}`}
                style={{ borderColor: `${GRADE_COLOR[zg]}44` }}
              >
                <div className={`flex shrink-0 items-center gap-2 ${tight ? 'mb-1.5' : 'mb-2.5'}`}>
                  <span
                    className="inline-block h-5 w-1.5 rounded-sm"
                    style={{ background: GRADE_COLOR[zg] }}
                  />
                  <span className="text-[21px] font-bold text-[#E6E8EB]">{z.kind}</span>
                  <span
                    className={`ml-auto text-[19px] font-bold ${gradeBlinks(zg) ? 'vaq-blink' : ''}`}
                    style={{ color: GRADE_COLOR[zg] }}
                  >
                    {GRADE_LABEL[zg]}
                  </span>
                </div>

                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                >
                  {ranked.map((m) => (
                    <div
                      key={m.key}
                      className={`flex flex-col items-center rounded-lg border bg-[#0C1015] ${tight ? 'py-0.5' : 'py-1.5'}`}
                      style={{
                        borderColor: m.judged ? `${GRADE_COLOR[m.grade]}55` : '#F5A62355',
                        borderStyle: m.judged ? 'solid' : 'dashed',
                      }}
                    >
                      <Gauge
                        value={m.value}
                        max={SCHOOL_GAUGE_MAX[m.key]}
                        color={GRADE_COLOR[m.grade]}
                        size={gaugeSize}
                        unit={m.unit}
                        decimals={m.decimals}
                        blink={m.judged && gradeBlinks(m.grade)}
                      />
                      <div className={`text-[15px] font-medium text-[#C9CFD8] ${tight ? 'mt-0.5' : 'mt-1.5'}`}>{m.label}</div>
                      <div
                        className="text-[15px] font-bold"
                        style={{ color: GRADE_COLOR[m.grade] }}
                      >
                        {GRADE_LABEL[m.grade]}
                      </div>
                    </div>
                  ))}
                </div>

                {/*
                  온도·습도 — 가로 막대(ComfortBar). 다른 6항목은 "낮을수록
                  좋다"라 원형 게이지가 맞지만, 온도·습도는 적정 구간이
                  가운데 있어 원형으로는 "지금 적정한가"가 읽히지 않는다.
                  기준표에 판정 기준이 없으므로 '참고'로 표기한다.

                  width를 반드시 넘긴다. 기본 440px를 좁은 칸에 넣으면
                  글자와 값이 좌우로 포개져 읽히지 않는다.
                  팝업 860 - 바깥 40 - 본문 40 - 칸 간격 12 = 768, 구역당 384,
                  구역 패딩 24를 빼면 360.
                */}
                <div className={tight ? 'mt-1 space-y-1' : 'mt-2 space-y-1.5'}>
                  {REFERENCE_ROW.map((m) => (
                    <ComfortBar
                      key={m.key}
                      kind={m.key}
                      value={z.reading[m.key]}
                      width={356}
                      compact
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => onOpenDetail(school.id)}
          className="shrink-0 border-t border-[#1B2029] bg-[#12161D] px-6 py-3 text-[15px] text-[#79828F] transition-colors hover:text-[#2DE1E1]"
        >
          8항목 전체 보기 — 누르면 순회가 멈춥니다
        </button>
      </div>
    </div>
  );
}
