'use client';

import { useEffect } from 'react';

/**
 * 화면 크기에 맞춰 UI 전체를 비례 확대/축소한다.
 *
 * 왜 필요한가
 * -----------
 * 관제실 모니터 해상도가 미확인이라 "50인치 TV 가정"으로 글자 크기를 px로
 * 박아 왔다. 그런데 같은 50인치라도 풀HD냐 4K냐에 따라 1px의 물리적 크기가
 * 두 배 차이 난다. 4K에서는 지금 크기가 절반으로 보여 멀리서 못 읽는다.
 *
 * 해상도를 물어보는 대신 화면이 알아서 맞추게 한다. 대표님 지시:
 * "모니터 해상도 연결하는 모니터 사이즈에 맞게 자동설정이 안되나?"
 *
 * 왜 rem이 아니라 zoom인가
 * ------------------------
 * 코드 전반이 Tailwind의 text-[13px] 같은 px 고정값을 쓴다. 루트 폰트
 * 크기(rem)를 키워도 px 값은 따라오지 않는다. 전부 rem으로 바꾸려면
 * 수백 군데를 손대야 하고, 그 과정에서 레이아웃이 깨진다.
 *
 * zoom은 글자·여백·아이콘·테두리를 한꺼번에 같은 비율로 키운다.
 * 레이아웃 비율이 유지되므로 이미 검증한 화면이 그대로 커진다.
 *
 * 기준 해상도
 * -----------
 * 1920x1080을 배율 1로 잡는다. 지금까지 모든 크기를 이 가정으로 맞춰
 * 왔고, 실제 화면 검증도 이 기준으로 했다.
 *
 * 가로와 세로 중 작은 쪽 비율을 쓴다. 가로만 보면 세로가 짧은 화면에서
 * 내용이 넘치고, 세로만 보면 와이드 화면에서 좌우가 빈다.
 *
 * 하한이 1.0인 이유
 * -----------------
 * 처음에 하한을 0.75로 뒀다가 검증 창(1280x577)에서 배율이 0.75로 떨어져
 * 화면 아래 3분의 1이 검게 비었다. zoom으로 줄이면 레이아웃이 쓰는 CSS
 * 픽셀 수가 늘어나는 게 아니라, 같은 내용이 작아지면서 남는 자리가
 * 그대로 빈 공간이 된다. 기준보다 작은 화면에서는 건드리지 않는 게 낫다.
 *
 * 상한 2.0은 8K 같은 극단적 화면에서 지나치게 커지는 것을 막는다.
 */
const BASE_W = 1920;
const BASE_H = 1080;

export default function ViewportScale() {
  useEffect(() => {
    const apply = () => {
      const byW = window.innerWidth / BASE_W;
      const byH = window.innerHeight / BASE_H;
      // 1.0 미만으로는 내리지 않는다. 줄여봐야 빈 공간만 생긴다.
      const scale = Math.max(1, Math.min(2, Math.min(byW, byH)));

      // zoom을 쓰면 body 안의 모든 길이 단위가 함께 커진다.
      // transform: scale()은 레이아웃 크기를 바꾸지 않아 스크롤바가
      // 생기므로 쓰지 않는다.
      document.body.style.zoom = String(scale);
      // 디버깅과 검증에서 현재 배율을 읽을 수 있게 남긴다.
      document.documentElement.dataset.vaqScale = scale.toFixed(3);
    };

    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  return null;
}
