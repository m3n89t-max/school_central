export type Status = 'normal' | 'warning' | 'critical';

/** 구역 종류. 학교당 보통 조리실·세척실 2구역(CLAUDE.md 2.1). */
export type ZoneKind = '조리실' | '세척실';

/** VAQ 센서 1조가 측정하는 8개 항목. 표시 순서도 이 순서를 따른다. */
export interface Reading {
  pm25: number; // 초미세먼지 ㎍/㎥
  pm10: number; // 미세먼지 ㎍/㎥
  co2: number; // 이산화탄소 ppm
  co: number; // 일산화탄소 ppm
  hcho: number; // 포름알데히드 ㎍/㎥
  temp: number; // 온도 ℃
  humidity: number; // 습도 %
  voc: number; // VOC(휘발성유기화합물) ppb — 기준표 단위. ㎍/㎥ 아님
}

export interface Zone {
  id: string;
  kind: ZoneKind;
  reading: Reading;
  status: Status;
}

export interface School {
  id: string;
  /** 목업 단계라 실제 학교명을 쓰지 않는다(CLAUDE.md 4. 표시 대상). */
  name: string;
  city: '제주시' | '서귀포시';
  region: string;
  lat: number;
  lng: number;
  zones: Zone[];
  status: Status;
}
