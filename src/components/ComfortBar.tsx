'use client';

import { useId } from 'react';

/**
 * 온도·습도 전용 가로 막대 — "적정 구간이 가운데 있다"를 보여주는 그림.
 *
 * 2026-10-23 대표님 지시: 온도·습도는 가로 그래프로.
 *
 * 왜 원형 게이지를 안 쓰는가:
 * 다른 6항목(PM10/PM2.5/CO2/VOC/HCHO/CO)은 0에서 출발해 올라갈수록 나쁜 단방향
 * 지표라 원형 게이지의 채움률이 곧 나쁨 정도다. 온도·습도는 양방향이다 —
 * 18℃도 32℃도 둘 다 나쁘다. 원형 게이지에 얹으면 채움이 적은 쪽(저온·건조)이
 * '좋음'으로 읽혀 관제자가 반대로 판단한다. 그래서 적정대를 가운데 둔
 * 가로 축으로 바꿨다. 위치 자체가 "가운데냐 바깥이냐"를 말한다.
 *
 * 왜 기준표 색(GRADE_COLOR)을 안 쓰는가:
 * 온도·습도는 조리실공기질기준표에 없다. 아래 구간값은 전부 미확인 임시값이다.
 * 여기에 기준표의 초록/노랑/빨강을 입히면 확정 판정이 있는 항목처럼 보인다 —
 * 교육청 시연에서 그건 거짓 정보다. 그래서 채도를 낮춘 호박/회색 2색조로만
 * 정도를 구분하고, 화면에 '참고'를 상시 노출한다. 점멸도 쓰지 않는다
 * (점멸은 기준표 '매우나쁨' 전용 신호이므로 참고값이 그 자리를 빌리면 안 된다).
 *
 * 색에만 의존하지 않는다(적색약 대응): 구간 이름을 글자로 띄우고,
 * 적정 밖 구간에는 사선 해치를 깔고, 현재 값은 삼각 포인터의 위치로 말한다.
 */

export interface ComfortBarProps {
  kind: 'temp' | 'humidity';
  value: number;
  width?: number;
  compact?: boolean;
}

/*
 * 구간 경계값 — **미확인. 현장 검증 필요.**
 *
 * 근거 없음을 숨기지 않기 위해 출처를 적어 둔다. 기존 코드의 참고 임시값
 * (thresholds.ts REFERENCE_THRESHOLDS: 온도 18/26/30/33, 습도 40/60/75/85)을
 * 가로 막대의 4구간(너무낮음/적정/높음/너무높음)으로 재배치한 것이다.
 *
 * 재배치 규칙: 원래 5단계(매우좋음~매우나쁨)는 단방향 지표용 사다리라
 * 양방향인 온도·습도에 맞지 않는다. 그래서
 *   - good 하한(온도 18, 습도 40)  → 적정대의 시작. 그 아래는 '너무낮음'.
 *   - normal 하한(온도 26, 습도 60) → 적정대의 끝. 여기부터 '높음'.
 *   - bad 하한(온도 30, 습도 75)   → '너무높음' 시작.
 *   - veryBad(온도 33, 습도 85)는 별도 구간으로 쪼개지 않았다. 참고값에
 *     4단계 이상을 주면 정밀한 기준이 있는 것처럼 보이고, 50인치 화면을
 *     몇 미터 밖에서 볼 때 구간이 잘게 나뉠수록 오히려 안 읽힌다.
 *
 * 확정 기준이 내려오면 이 상수만 교체한다.
 */
const COMFORT_BANDS = {
  temp: { okFrom: 18, okTo: 26, highTo: 30 },
  humidity: { okFrom: 40, okTo: 60, highTo: 75 },
} as const;

/*
 * 축 범위 — 미확인. 센서 실측 분포가 없어 임의로 잡았다.
 * 적정대가 막대의 가운데쯤에 오도록 맞춘 값이다. 적정대가 한쪽으로 치우치면
 * "가운데가 안전지대"라는 그림 자체가 성립하지 않는다.
 * 조리실 실측 분포가 확보되면 재조정할 것.
 */
const AXIS = {
  temp: { min: 8, max: 40, unit: '℃', label: '온도', decimals: 1 },
  humidity: { min: 10, max: 100, unit: '%', label: '습도', decimals: 0 },
} as const;

/*
 * 색 — 막대 본체는 kind별 그라디언트(RAMP)가 칠한다. 여기엔 바탕·경계·글자만 둔다.
 * 호박색은 프로젝트에서 이미 '확정 판정 아님'에 가까운 중립 경고색으로 남아 있다
 * (지도 3색에서는 적색약 문제로 #FDE047에 자리를 내준 색이라, 판정 3색과
 *  섞여 보일 위험이 없다는 점도 여기선 장점이다).
 */
const COLOR = {
  bg: '#161B22', // 막대 바닥. 관제 배경(#0F1319)보다 한 톤 밝게 띄운다
  ok: '#2C4A46', // 적정 — 가장 차분한 청록 회색
  okEdge: '#5E8F84', // 적정대 경계선. 안전지대의 '문'을 선으로 그어 준다
  pointer: '#FFFFFF',
  text: '#E6EDF3',
  textDim: '#8B98A5',
} as const;

type BandKey = 'tooLow' | 'ok' | 'high' | 'tooHigh';

const BAND_LABEL: Record<BandKey, string> = {
  tooLow: '너무낮음',
  ok: '적정',
  high: '높음',
  tooHigh: '너무높음',
};

export default function ComfortBar({ kind, value, width = 440, compact = false }: ComfortBarProps) {
  /*
   * 한 화면에 온도·습도 막대가 구역 수만큼 깔린다(자동투어 팝업에서는 더 많다).
   * pattern/clipPath id가 겹치면 먼저 정의된 쪽 해치를 물고 와 남의 색이 나온다.
   */
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rampId = `cbRamp${uid}`;
  const clipId = `cbClip${uid}`;

  const axis = AXIS[kind];
  const band = COMFORT_BANDS[kind];

  /*
   * 센서 장애 시 NaN/Infinity가 그대로 내려온다. 좌표 계산에 들어가면 SVG가
   * 통째로 사라져 관제 화면에 구멍이 생기므로 여기서 끊는다.
   */
  const valid = Number.isFinite(value);
  const clamped = valid ? Math.min(axis.max, Math.max(axis.min, value)) : axis.min;
  // 축 밖(습도 120%, 온도 -5℃)은 포인터를 끝에 붙인 뒤 꼬리표로 알린다.
  const outOfAxis = valid && (value > axis.max || value < axis.min);

  const currentBand: BandKey | null = !valid
    ? null
    : value < band.okFrom
      ? 'tooLow'
      : value < band.okTo
        ? 'ok'
        : value < band.highTo
          ? 'high'
          : 'tooHigh';

  // 50인치를 몇 미터 밖에서 읽는 화면이다. 축소판이어도 얇게 만들지 않는다.
  const barH = compact ? 22 : 34;
  const valueFs = compact ? 26 : 40;
  const bandNameFs = compact ? 15 : 20;
  const tickFs = compact ? 12 : 14;
  const bandLabelFs = compact ? 11 : 14;
  const PAD = 2; // 포인터 삼각형이 막대 양끝에서 잘리지 않도록 남기는 여백
  const innerW = Math.max(40, width - PAD * 2);

  const posOf = (v: number) => PAD + ((v - axis.min) / (axis.max - axis.min)) * innerW;
  const xOkFrom = posOf(band.okFrom);
  const xOkTo = posOf(band.okTo);
  const xHighTo = posOf(band.highTo);
  const xEnd = PAD + innerW;
  const pointerX = posOf(clamped);

  const text = valid ? value.toFixed(axis.decimals) : '--';

  /*
    막대 채색 — 2026-10-26 대표님 지시로 연속 그라디언트로 바꿨다.
    "온도 습도도 그래프 색상이 복잡하니 온도는 빨간계열 그라디에이션과
     습도는 파란 계열의 그라디에이션으로 온도와 습도에 따라 변화를 줘"

    전에는 4개 구간을 서로 다른 색 사각형 + 해치 2종으로 칠했다. 경계가
    딱딱 끊겨 막대 하나에 색이 6개씩 들어갔고, 몇 m 떨어져 보면 무슨
    그림인지 읽히지 않았다.

    이제 항목마다 색 계열을 하나씩 준다.
      온도 = 빨강 계열 (찬 쪽 어둡게 → 더운 쪽 밝고 진하게)
      습도 = 파랑 계열 (건조한 쪽 어둡게 → 습한 쪽 밝고 진하게)
    값이 오르면 색이 자연히 진해지므로, 포인터를 못 보더라도 막대의
    어느 색 구간에 있는지로 대략을 읽을 수 있다.

    적정 구간은 색이 아니라 경계선(okEdge)과 눈금으로만 표시한다.
    색으로 또 나누면 그라디언트가 다시 끊겨 원래 문제로 돌아간다.
  */
  const RAMP = {
    temp: ['#2B1416', '#7A1F22', '#C62828', '#FF5A3C'],
    humidity: ['#0E1F33', '#15497F', '#1E78C8', '#45B8F5'],
  } as const;
  const ramp = RAMP[kind];

  // 포인터 높이는 막대 위로 솟는 삼각형 + 막대를 관통하는 세로선으로 구성된다.
  const tipH = compact ? 9 : 12;
  const tipW = compact ? 9 : 12;
  const svgH = barH + tipH + (compact ? 2 : 4);
  const barTop = tipH;

  return (
    <div style={{ width, color: COLOR.text }}>
      {/* 머리줄: 항목명 + '참고' 배지 / 현재 값 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: compact ? 4 : 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: compact ? 14 : 18, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {axis.label}
          </span>
          {/*
            '참고' 배지 — 기준표에 없는 항목임을 화면에서 지우지 않기 위한 표식.
            점선 테두리는 상세 패널(AlarmDetail)이 참고 항목에 쓰는 표기와 같은 문법이다.
          */}
          <span
            style={{
              fontSize: compact ? 10 : 12,
              fontWeight: 700,
              lineHeight: 1,
              padding: compact ? '2px 5px' : '3px 7px',
              borderRadius: 4,
              border: `1px dashed ${COLOR.textDim}`,
              color: COLOR.textDim,
              whiteSpace: 'nowrap',
            }}
          >
            참고
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
          {currentBand && (
            <span style={{ fontSize: bandNameFs, fontWeight: 700, color: COLOR.textDim }}>
              {BAND_LABEL[currentBand]}
            </span>
          )}
          <span
            style={{
              fontSize: valueFs,
              fontWeight: 700,
              lineHeight: 1,
              color: COLOR.text,
              textShadow: '0 2px 4px rgba(0,0,0,.8)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {text}
          </span>
          <span style={{ fontSize: compact ? 14 : 18, color: COLOR.textDim }}>{axis.unit}</span>
        </div>
      </div>

      <svg
        width={width}
        height={svgH}
        viewBox={`0 0 ${width} ${svgH}`}
        role="img"
        aria-label={
          valid
            ? `${axis.label} ${text}${axis.unit}, 참고 구간 ${currentBand ? BAND_LABEL[currentBand] : ''}`
            : `${axis.label} 값 없음`
        }
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          {/*
            값 축 방향 그라디언트. x축 전체(0~1)에 색 4개를 고르게 깔아,
            막대 왼쪽 끝이 가장 낮은 값, 오른쪽 끝이 가장 높은 값이 된다.
            useId로 고유화하지 않으면 한 화면의 온도 바가 습도 바의
            그라디언트를 물고 와 파란 온도계가 나온다.
          */}
          <linearGradient id={rampId} x1="0" y1="0" x2="1" y2="0">
            {ramp.map((c, i) => (
              <stop key={c} offset={`${(i / (ramp.length - 1)) * 100}%`} stopColor={c} />
            ))}
          </linearGradient>

          <clipPath id={clipId}>
            <rect x={PAD} y={barTop} width={innerW} height={barH} rx={barH / 2} />
          </clipPath>
        </defs>

        <rect x={PAD} y={barTop} width={innerW} height={barH} rx={barH / 2} fill={COLOR.bg} />

        <g clipPath={`url(#${clipId})`}>
          {/* 연속 그라디언트 한 장. 구간 사각형을 겹치지 않아 색이 끊기지 않는다. */}
          <rect x={PAD} y={barTop} width={innerW} height={barH} fill={`url(#${rampId})`} />

          {/* 적정대 경계선. 선 두 개가 '안전지대의 문'으로 읽힌다. */}
          <line
            x1={xOkFrom}
            y1={barTop}
            x2={xOkFrom}
            y2={barTop + barH}
            stroke={COLOR.okEdge}
            strokeWidth={2}
          />
          <line
            x1={xOkTo}
            y1={barTop}
            x2={xOkTo}
            y2={barTop + barH}
            stroke={COLOR.okEdge}
            strokeWidth={2}
          />
          <line
            x1={xHighTo}
            y1={barTop}
            x2={xHighTo}
            y2={barTop + barH}
            stroke="rgba(255,255,255,.22)"
            strokeWidth={1}
          />
        </g>

        <rect
          x={PAD}
          y={barTop}
          width={innerW}
          height={barH}
          rx={barH / 2}
          fill="none"
          stroke="rgba(255,255,255,.14)"
        />

        {/* 구간 이름을 막대 안에 직접 쓴다 — 색을 못 읽어도 글자가 남는다.
            축소판은 폭이 모자라 생략하고, 머리줄의 구간명이 그 역할을 받는다.
            막대는 이제 연속 그라디언트라 구간 사각형이 없으므로, 글자를
            놓을 자리만 경계 x좌표에서 다시 계산한다. */}
        {!compact &&
          (
            [
              { key: 'tooLow' as BandKey, x: PAD, w: xOkFrom - PAD },
              { key: 'ok' as BandKey, x: xOkFrom, w: xOkTo - xOkFrom },
              { key: 'high' as BandKey, x: xOkTo, w: xHighTo - xOkTo },
              { key: 'tooHigh' as BandKey, x: xHighTo, w: xEnd - xHighTo },
            ] as const
          ).map((s) =>
            s.w < 46 ? null : (
              <text
                key={`l-${s.key}`}
                x={s.x + s.w / 2}
                y={barTop + barH / 2 + bandLabelFs * 0.36}
                textAnchor="middle"
                fontSize={bandLabelFs}
                fontWeight={currentBand === s.key ? 700 : 400}
                fill={currentBand === s.key ? '#FFFFFF' : 'rgba(255,255,255,.62)'}
                style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.45)', strokeWidth: 2.5 }}
              >
                {BAND_LABEL[s.key]}
              </text>
            ),
          )}

        {/*
          현재 값 포인터. transform을 CSS로 넣어야 값이 바뀔 때 transition이 걸린다
          (SVG transform 속성은 애니메이션되지 않는다).
          값이 없을 때는 아예 그리지 않는다 — 0 위치에 세워 두면 '저온'으로 오독된다.
        */}
        {valid && (
          <g
            style={{
              transform: `translateX(${pointerX}px)`,
              transition: 'transform .5s ease',
            }}
          >
            <polygon
              points={`0,${tipH} ${-tipW / 2},0 ${tipW / 2},0`}
              fill={COLOR.pointer}
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.9))' }}
            />
            <line
              x1={0}
              y1={barTop}
              x2={0}
              y2={barTop + barH}
              stroke={COLOR.pointer}
              strokeWidth={compact ? 2.5 : 3.5}
              strokeLinecap="butt"
            />
            <line
              x1={0}
              y1={barTop}
              x2={0}
              y2={barTop + barH}
              stroke="rgba(0,0,0,.55)"
              strokeWidth={compact ? 5 : 7}
              strokeLinecap="butt"
              style={{ mixBlendMode: 'multiply' }}
            />
          </g>
        )}
      </svg>

      {/* 경계 눈금값. 적정대 양끝을 밝게 써서 "이 사이가 적정"이 숫자로도 남는다. */}
      {!compact && (
        <div
          style={{
            position: 'relative',
            height: tickFs + 6,
            marginTop: 2,
            fontSize: tickFs,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {(
            [
              { v: axis.min, dim: true },
              { v: band.okFrom, dim: false },
              { v: band.okTo, dim: false },
              { v: band.highTo, dim: true },
              { v: axis.max, dim: true },
            ] as const
          ).map((t) => (
            <span
              key={t.v}
              style={{
                position: 'absolute',
                left: posOf(t.v),
                transform: 'translateX(-50%)',
                color: t.dim ? COLOR.textDim : COLOR.text,
                fontWeight: t.dim ? 400 : 700,
                whiteSpace: 'nowrap',
              }}
            >
              {t.v}
            </span>
          ))}
        </div>
      )}

      {/* 축을 벗어난 값은 포인터가 끝에 멈춰 있어 실제 크기를 못 보여준다. 글자로 보완한다. */}
      {outOfAxis && (
        <div style={{ marginTop: 2, fontSize: compact ? 11 : 13, color: COLOR.textDim }}>
          {value > axis.max ? '축 상한 초과' : '축 하한 미달'} (실측 {text}
          {axis.unit})
        </div>
      )}
      {!valid && (
        <div style={{ marginTop: 2, fontSize: compact ? 11 : 13, color: COLOR.textDim }}>
          센서 값 없음
        </div>
      )}
    </div>
  );
}
