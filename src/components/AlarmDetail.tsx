'use client';

import Gauge, { SCHOOL_GAUGE_MAX } from '@/components/Gauge';
import type { School, Zone } from '@/lib/types';
import {
  GRADE_COLOR,
  GRADE_LABEL,
  GRADE_THRESHOLDS,
  REFERENCE_THRESHOLDS,
  gradeBlinks,
  metricGrade,
  readingGrade,
  referenceGrade,
} from '@/lib/thresholds';
import type { Grade, JudgedMetric, ReferenceMetric } from '@/lib/thresholds';

/**
 * 학교 상세 창 — 학교 배포본(school_vaq / vaq2) 대시보드와 같은 구성.
 *
 * 지도에서 학교를 클릭하면 열린다(2026-10-16 대표님 지시).
 * 상단 바는 고정이고 본문(구역 섹션)만 스크롤한다.
 *
 * 구성: 구역(조리실/세척실)마다 8항목을 4열 × 2행 카드 격자로 깐다.
 * 각 카드는 원형 게이지(Gauge.tsx 공용 컴포넌트) + 등급 라벨 + 기준치 안내.
 *
 * 2026-10-23 Gauge 교체 반영:
 *   - 게이지 상한을 Gauge.tsx의 SCHOOL_GAUGE_MAX로 일원화했다. 학교 화면의
 *     maxValue와 같은 값이라, 여기서 따로 상한을 두면 두 화면의 채움률이 어긋난다.
 *   - 수치와 단위는 게이지가 중앙에 직접 그린다. 카드에서 같은 수치를 다시
 *     크게 적던 블록은 제거했다(중복 제거).
 *   - 점멸은 게이지(테두리 애니메이션)로 일원화했다. 카드 테두리에 붙이던
 *     vaq-blink는 떼어냈다 — 둘이 함께 깜빡이면 16개가 깔린 화면이 산만해진다.
 *   - 항목명만 카드가 그린다. 게이지의 label prop은 쓰지 않는다. 한글 전체
 *     이름이 게이지 폭(132px)에서 1~2줄로 들쭉날쭉 접히면 같은 행의 게이지
 *     중심선이 어긋나기 때문이다. 카드가 고정 높이 두 줄 자리로 잡아 정렬을 지킨다.
 *
 * ⚠️ 온도·습도는 조리실공기질기준표에 **없는 참고값**이다.
 *    색과 등급은 입히되 '참고' 배지·점선 테두리·기준치 문구로 나머지 6항목과
 *    반드시 구분한다. 학교 상태 판정에는 쓰지 않는다(readingGrade가 6항목만 본다).
 *    참고값은 점멸시키지 않는다(blink는 judged 항목에만 준다).
 */

/**
 * 원형 게이지 렌더 크기(px).
 *
 * 카드 가용 폭에서 역산했다. 창 최대폭 1100 − 본문 좌우 패딩 40 = 1060,
 * 4열 gap-3(12×3=36)을 빼면 카드 1장 약 256, 카드 패딩 p-3(24)을 빼면 232.
 * 여기에 132를 넣으면 좌우로 50씩 여유가 남아 어떤 폭에서도 잘리지 않는다.
 * 반원 게이지(104)보다 키우되, 한 구역 8개 × 2구역 = 16개가 과하게 길어지지
 * 않는 지점이다(원형은 세로를 반원의 두 배 가까이 쓴다).
 */
const GAUGE_SIZE = 132;

interface MetricSpec {
  key: JudgedMetric | ReferenceMetric;
  label: string;
  unit: string;
  /** true = 기준표 판정 항목, false = 기준표 밖 참고 항목(온도·습도). */
  judged: boolean;
  /** 게이지 중앙 수치의 소수 자릿수. 학교 화면 표기와 같게 맞춘 값. */
  decimals: number;
}

/** 참조 디자인 순서: PM10 → PM2.5 → CO2 → VOC → HCHO → CO → 온도 → 습도. */
const METRICS: MetricSpec[] = [
  { key: 'pm10', label: '미세먼지(PM10)', unit: '㎍/㎥', judged: true, decimals: 0 },
  { key: 'pm25', label: '초미세먼지(PM2.5)', unit: '㎍/㎥', judged: true, decimals: 0 },
  { key: 'co2', label: '이산화탄소(CO₂)', unit: 'ppm', judged: true, decimals: 0 },
  { key: 'voc', label: 'VOC', unit: 'ppb', judged: true, decimals: 0 },
  { key: 'hcho', label: '포름알데히드(HCHO)', unit: '㎍/㎥', judged: true, decimals: 1 },
  { key: 'co', label: '일산화탄소(CO)', unit: 'ppm', judged: true, decimals: 1 },
  { key: 'temp', label: '온도', unit: '℃', judged: false, decimals: 1 },
  { key: 'humidity', label: '습도', unit: '%RH', judged: false, decimals: 0 },
];

/** 기준표 밖 참고 항목임을 알리는 공통 배지. 온도·습도에만 붙는다. */
function ReferenceBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="조리실공기질기준표에 없는 항목입니다. 현장 임시 구간을 참고로 표시할 뿐이며 학교 상태 판정에 쓰지 않습니다."
      className={`shrink-0 rounded border border-dashed border-[#F5A623]/60 bg-[#F5A623]/10 px-1 py-px text-[10px] font-semibold leading-none text-[#F5A623] ${className}`}
    >
      참고
    </span>
  );
}

function MetricCard({ spec, value }: { spec: MetricSpec; value: number }) {
  // 등급·색은 전부 thresholds.ts가 결정한다. 여기서 계산하지 않는다.
  const grade: Grade = spec.judged
    ? metricGrade(spec.key as JudgedMetric, value)
    : referenceGrade(spec.key as ReferenceMetric, value);
  const color = GRADE_COLOR[grade];
  // 점멸은 기준표 판정 항목에만 적용한다(참고값이 화면을 깜빡이게 하면 안 된다).
  const blink = spec.judged && gradeBlinks(grade);
  const band = spec.judged
    ? GRADE_THRESHOLDS[spec.key as JudgedMetric]
    : REFERENCE_THRESHOLDS[spec.key as ReferenceMetric];

  return (
    <div
      className={[
        'flex flex-col items-center rounded-xl bg-[#0F131A] p-3',
        // 참고 항목은 점선 테두리로 한눈에 구분된다.
        spec.judged ? 'border' : 'border border-dashed',
      ].join(' ')}
      // 판정 항목의 테두리는 등급색으로만 두고 점멸은 게이지가 맡는다.
      style={{ borderColor: spec.judged ? color : '#F5A623' }}
    >
      {/* 항목명 — 카드가 그리는 유일한 텍스트 축. 두 줄 자리를 고정해
          같은 행 게이지의 중심선이 어긋나지 않게 한다. */}
      <div className="flex h-[34px] items-center justify-center text-center text-[13px] font-semibold leading-tight text-[#E6E8EB]">
        {spec.label}
      </div>

      {/*
        원형 게이지 — 수치(중앙 큰 글씨)·단위·채움률·점멸을 모두 게이지가 그린다.
        상한은 SCHOOL_GAUGE_MAX(학교 화면 maxValue와 동일)만 쓴다.
      */}
      <Gauge
        value={value}
        max={SCHOOL_GAUGE_MAX[spec.key]}
        color={color}
        size={GAUGE_SIZE}
        unit={spec.unit}
        decimals={spec.decimals}
        blink={blink}
      />

      {/* 등급 라벨 + 참고 배지 */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5">
        <span
          className="rounded px-2 py-0.5 text-[11px] font-bold text-[#0B0E13]"
          style={{ background: color }}
        >
          {GRADE_LABEL[grade]}
        </span>
        {spec.judged ? null : <ReferenceBadge />}
      </div>

      {/* 기준치 안내 */}
      <div className="mt-2 w-full border-t border-[#1B2029] pt-1.5 text-center text-[10px] leading-tight text-[#4E5765]">
        {spec.judged ? (
          <>
            기준표 · 나쁨 {band.bad}
            {spec.unit} 이상
          </>
        ) : (
          <span className="text-[#8A6A2A]">기준표 없음 · 현장 임시구간({band.bad}↑ 나쁨)</span>
        )}
      </div>
    </div>
  );
}

function ZoneSection({ zone }: { zone: Zone }) {
  // 구역 종합 등급도 thresholds.ts가 계산한다(온도·습도 제외).
  const grade = readingGrade(zone.reading);
  const color = GRADE_COLOR[grade];
  const blink = gradeBlinks(grade);

  return (
    <section className="mb-6 last:mb-0">
      <div className="mb-3 flex items-center gap-2 border-l-4 pl-2.5" style={{ borderColor: color }}>
        <h3 className="text-[16px] font-semibold text-[#E6E8EB]">{zone.kind}</h3>
        <span className={`text-[13px] font-bold${blink ? ' vaq-blink' : ''}`} style={{ color }}>
          {GRADE_LABEL[grade]}
        </span>
        <span className="ml-auto text-[10px] text-[#4E5765]">
          종합 등급은 기준표 6항목으로만 판정 (온도·습도 제외)
        </span>
      </div>

      {/* 4열 × 2행 = 8항목 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {METRICS.map((m) => (
          <MetricCard key={m.key} spec={m} value={zone.reading[m.key]} />
        ))}
      </div>
    </section>
  );
}

export default function AlarmDetail({
  school,
  onClose,
  onOpenHistory,
}: {
  school: School;
  onClose: () => void;
  onOpenHistory: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#05070A]/80 p-6">
      <div className="flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-[#232A35] bg-[#0C1015] shadow-2xl">
        {/* 상단 바 — 고정(shrink-0), 본문만 스크롤된다. */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#1B2029] bg-[#12161D] px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-[20px] font-semibold text-[#E6E8EB]">{school.name}</h2>
            <span className="shrink-0 text-[12px] text-[#79828F]">
              {school.city} {school.region}
            </span>
            <span className="shrink-0 rounded-md border border-[#F5A623]/35 bg-[#F5A623]/10 px-2 py-0.5 text-[11px] text-[#F5A623]">
              측정값은 목업
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={onOpenHistory}
              className="rounded-lg border border-[#232A35] px-2.5 py-1.5 text-[12px] text-[#79828F] hover:text-[#C9CFD8]"
            >
              이력 보기
            </button>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="rounded-lg px-2 py-1 text-[#79828F] hover:bg-[#161B23] hover:text-[#E6E8EB]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 본문 — 여기만 스크롤 */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {school.zones.map((z) => (
            <ZoneSection key={z.id} zone={z} />
          ))}

          <p className="mt-3 border-t border-[#1B2029] pt-2 text-[11px] leading-relaxed text-[#4E5765]">
            판정 기준: 조리실공기질기준표(현장 탑재 정본) 5단계 — 매우좋음/좋음/보통/나쁨/매우나쁨.
            매우나쁨은 게이지 점멸로 구분한다.{' '}
            <span className="text-[#8A6A2A]">
              온도·습도는 기준표에 없는 항목으로, 학교 현장 시스템의 임시 구간을 참고로 표시할 뿐이며
              구역·학교 상태 판정에 반영하지 않는다(점멸도 적용하지 않는다).
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
