'use client';

import { useId } from 'react';

/**
 * 원형 게이지 — 학교 현장 화면(vaq2)과 같은 그림.
 *
 * 2026-10-23 대표님 지시: "각 학교에 들어가는 공기질 표출 화면이야.
 * 여기 있는 그래프 참조해서 동일하게 해줘."
 *
 * 중앙관제와 학교 화면은 같은 설비를 보는 두 창이다. 같은 수치가 두 화면에서
 * 다른 그림으로 보이면 관제자와 현장 담당자가 서로 다른 것을 보며 통화하게 된다.
 * 그래서 더 보기 좋게 만들지 않고 vaq2의 치수·색·동작을 그대로 옮겼다.
 *
 * 원본: VAQ/vaq2/vaq2/client/src/pages/Dashboard.tsx 의 CircularGauge
 *       VAQ/vaq2/vaq2/client/src/styles.css 의 .circular-gauge 이하
 *
 * 옮긴 사양(원본 CSS 기준):
 *   - 170px 원, 8px 상태색 테두리, 안쪽 radial-gradient #1a1a1a → #0f0f0f
 *   - 진행 링 stroke-width 8 / linecap round / -90도 회전(12시 시작)
 *   - 트랙 #2a2a2a
 *   - 중앙 수치 42px 흰색 굵게 + text-shadow, 아래 단위 14px #aaa
 *   - 채움 전환 0.5s ease, 색 전환 0.3s ease
 *   - 매우나쁨은 테두리 점멸(1.5s) + 마젠타 글로우
 *
 * 일부러 그대로 둔 것: 값이 상한을 넘어도 링은 100%에서 멈춘다.
 * 원본이 그렇고, 초과 상태는 색과 점멸이 전달한다. 여기에 경고 표식을
 * 추가하면 학교 화면에 없는 기호가 중앙관제에만 생긴다.
 */

export interface GaugeProps {
  value: number;
  /** 게이지 상한. 학교 화면의 maxValue와 같아야 채움률이 일치한다. */
  max: number;
  /** 링과 테두리 색. 등급 판정은 호출부 책임이며 받은 색만 쓴다. */
  color: string;
  /** 렌더 크기(px). 원본은 170. 내부 치수는 비례 축소된다. */
  size?: number;
  /** 게이지 위 항목명. 원본 .metric-label(20px 흰색 굵게). */
  label?: string;
  /** 중앙 수치 아래 단위. */
  unit?: string;
  /** 소수 자릿수. 원본은 포름알데히드만 1자리, 나머지 0자리. */
  decimals?: number;
  /** 매우나쁨 점멸. 원본 .status-very-bad 애니메이션. */
  blink?: boolean;
}

/*
 * 원본 viewBox 기준 치수. 이 숫자를 바꾸면 학교 화면과 그림이 어긋난다.
 * 원본은 170px 박스에 border 8px + viewBox 170에서 r=77 링이었다.
 * SVG 한 장으로 합치면서 테두리를 원 안으로 넣어야 해서, 테두리 중심을
 * r=81(=85-4)에 두고 링을 그 안쪽 r=70으로 옮겼다. 겉보기 비율은 같다.
 */
const BOX = 170;
const C = BOX / 2;
const RING_R = 70;
const RING_W = 8;
const BORDER_R = 81;
const BORDER_W = 8;
const FACE_R = 77;
const CIRCUMFERENCE = 2 * Math.PI * RING_R;

export default function Gauge({
  value,
  max,
  color,
  size = BOX,
  label,
  unit,
  decimals = 0,
  blink = false,
}: GaugeProps) {
  /*
   * 한 화면에 게이지가 16개 깔린다. gradient id가 겹치면 남의 그라데이션을
   * 물고 와 색이 뒤섞이므로 인스턴스마다 분리한다.
   */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const faceId = `vgf${uid}`;
  const animName = `vaqGaugeBlink${uid}`;

  /*
   * 센서 장애 시 NaN이, 상한 미설정 시 0이 그대로 내려오는 일이 있다.
   * NaN이 dashoffset에 들어가면 링이 사라져 관제 화면에 구멍이 생긴다.
   */
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeColor = typeof color === 'string' && color.trim() ? color : '#92D050';

  // 원본과 같이 0~100%로 가둔다. 상한 초과는 색과 점멸이 알린다.
  const pct = Math.min(100, Math.max(0, (safeValue / safeMax) * 100));
  const offset = CIRCUMFERENCE - (CIRCUMFERENCE * pct) / 100;

  const text = Number.isFinite(value) ? safeValue.toFixed(decimals) : '-';
  // 자릿수가 늘면 원 밖으로 삐져나간다. 글자 수에 따라 줄인다.
  const valueFs = text.length >= 6 ? 30 : text.length >= 5 ? 35 : 42;

  return (
    <div
      style={{
        width: size,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: Math.round((14 * size) / BOX),
      }}
    >
      {label && (
        <div
          style={{
            fontSize: Math.max(11, Math.round((20 * size) / BOX)),
            fontWeight: 700,
            color: '#ffffff',
            textAlign: 'center',
            lineHeight: 1.2,
          }}
        >
          {label}
        </div>
      )}

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${BOX} ${BOX}`}
        role="img"
        aria-label={`${label ?? '게이지'} ${text}${unit ?? ''}`}
        style={{ display: 'block' }}
      >
        <defs>
          <radialGradient id={faceId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#0f0f0f" />
          </radialGradient>

          {/* 점멸은 매우나쁨일 때만 주입한다. 정상 게이지가 쓸데없는 애니메이션
              노드를 들고 있지 않게 하려는 의도. */}
          {blink && (
            <style>{`
              @keyframes ${animName} {
                0%, 100% { stroke: ${safeColor}; filter: drop-shadow(0 0 0 rgba(255,0,255,0)); }
                50%      { stroke: #FF00FF; filter: drop-shadow(0 0 12px rgba(255,0,255,.8)); }
              }
              @media (prefers-reduced-motion: reduce) {
                .${animName} { animation: none !important; }
              }
            `}</style>
          )}
        </defs>

        {/* 다이얼 바닥 */}
        <circle cx={C} cy={C} r={FACE_R} fill={`url(#${faceId})`} />

        {/* 상태색 테두리 */}
        <circle
          className={blink ? animName : undefined}
          cx={C}
          cy={C}
          r={BORDER_R}
          fill="none"
          stroke={safeColor}
          strokeWidth={BORDER_W}
          style={{
            transition: 'stroke .3s ease',
            animation: blink ? `${animName} 1.5s ease-in-out infinite` : undefined,
          }}
        />

        {/* 진행 링 — -90도 회전으로 12시에서 시작(원본 .gauge-progress) */}
        <g transform={`rotate(-90 ${C} ${C})`}>
          <circle cx={C} cy={C} r={RING_R} fill="none" stroke="#2a2a2a" strokeWidth={RING_W} />
          <circle
            cx={C}
            cy={C}
            r={RING_R}
            fill="none"
            stroke={safeColor}
            strokeWidth={RING_W}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            style={{
              strokeDashoffset: offset,
              transition: 'stroke-dashoffset .5s ease, stroke .3s ease',
            }}
          />
        </g>

        {/* 중앙 수치. 원본은 HTML div였지만 SVG text로 두면 size에 맞춰 함께 줄어든다. */}
        <text
          x={C}
          y={unit ? C + 4 : C + 14}
          textAnchor="middle"
          fontSize={valueFs}
          fontWeight="bold"
          fill="#ffffff"
          style={{ textShadow: '0 2px 4px rgba(0,0,0,.8)' }}
        >
          {text}
        </text>
        {unit && (
          <text x={C} y={C + 26} textAnchor="middle" fontSize={14} fill="#aaaaaa">
            {unit}
          </text>
        )}
      </svg>
    </div>
  );
}

/**
 * 게이지 상한 — 학교 화면(Dashboard.tsx metricInfo)의 maxValue 그대로.
 *
 * 같은 수치가 두 화면에서 다른 채움률로 보이면 안 되므로 임의로 바꾸지 말 것.
 * 바꾸려면 학교 배포본도 함께 바꿔야 한다.
 *
 * 온도·습도는 학교 화면의 원형 게이지 목록에 없다(별도 패널에서 표시).
 * 중앙관제는 8항목을 한자리에 모으므로 상한을 따로 두되, 미확인 값이다.
 */
export const SCHOOL_GAUGE_MAX = {
  pm10: 400,
  pm25: 200,
  co2: 5000,
  co: 50,
  voc: 2000,
  hcho: 500,
  temp: 50, // 미확인 — 학교 화면에 원형 게이지가 없어 중앙관제 임의값
  humidity: 100, // 미확인 — 동일
} as const;
