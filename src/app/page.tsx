'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import TopNav, { type ViewId } from '@/components/TopNav';
import KakaoMap from '@/components/KakaoMap';
import DetailPanel from '@/components/DetailPanel';
import DiagnosticMatrix from '@/components/DiagnosticMatrix';
import AlarmGrid from '@/components/AlarmGrid';
import AlarmDetail from '@/components/AlarmDetail';
import AutoTourPopup from '@/components/AutoTourPopup';
import HistoryPanel from '@/components/HistoryPanel';
import OverviewPanel from '@/components/OverviewPanel';
import ZoneGridPanel from '@/components/ZoneGridPanel';
import OutdoorPanel from '@/components/OutdoorPanel';
import AlertsPanel from '@/components/AlertsPanel';
import PendingPanel from '@/components/PendingPanel';
import { SITE_COUNT, buildSchools, countByStatus } from '@/lib/mock';
import { buildOutdoor, regionOf } from '@/lib/outdoor';
import { buildDiagnoses } from '@/lib/diagnosis';
import { createAlarmState, stepAlarms, MAX_POPUPS } from '@/lib/alarm';
import type { Alarm } from '@/lib/alarm';
import {
  createAutopilot,
  stepAutopilot,
  interact,
  autopilotLabel,
  FOCUS_LEVEL,
  DWELL_MS,
} from '@/lib/autopilot';

/** CLAUDE.md 1. 개요 — 실시간 갱신 주기 5초. */
const REFRESH_MS = 5000;

/**
 * 오토파일럿 판단 주기.
 *
 * 데이터 갱신(5초)과 분리한 이유: 체류 시간이 15초라 5초 단위로만 판단하면
 * 전환 시점이 최대 5초까지 밀린다. 1초로 돌려 남은 시간 표시도 매초 줄어들게 한다.
 */
const PILOT_MS = 1000;

export default function Page() {
  const [tick, setTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOutdoor, setShowOutdoor] = useState(true);
  const [showMatrix, setShowMatrix] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  /**
   * 헤더 메뉴로 여는 화면. 'map'이 바탕(패널 없음)이다.
   *
   * 패널마다 boolean을 따로 두면(showHistory, showMatrix, ...) 두 개가
   * 동시에 true가 되는 상태가 생긴다. 관제 화면에서 패널이 겹쳐 뜨면
   * 어느 것이 위인지 알 수 없어 닫는 법을 잃는다. 한 번에 하나만
   * 열리도록 단일 상태로 둔다.
   */
  const [view, setView] = useState<ViewId>('map');
  const showHistory = view === 'history';
  /**
   * 상단 메뉴 표시 여부. 평소엔 숨기고 화면 맨 위에 마우스를 대면 내려온다.
   * 무인 관제 화면이라 메뉴가 상시 56px을 먹을 이유가 없다.
   */
  const [navOpen, setNavOpen] = useState(false);
  /** 자동 팝업 on/off. 관제자가 끌 수 있어야 한다. */
  const [autoPopup, setAutoPopup] = useState(true);
  /** 팝업 카드를 눌러 연 상세 창. 지도 마커 클릭(selectedId)과는 별개다. */
  const [detailId, setDetailId] = useState<string | null>(null);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [now, setNow] = useState(0);

  // 경보 추적 상태는 렌더와 무관하게 유지돼야 한다.
  const alarmState = useRef(createAlarmState());

  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = () => {
      const d = new Date();
      setUpdatedAt(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
      setNow(d.getTime());
    };
    stamp();
    const id = setInterval(() => {
      setTick((t) => t + 1);
      stamp();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const schools = useMemo(() => buildSchools(tick), [tick]);
  const counts = useMemo(() => countByStatus(schools), [schools]);
  const outdoor = useMemo(() => buildOutdoor(tick), [tick]);
  const diagnoses = useMemo(() => buildDiagnoses(schools), [schools]);
  const selected = schools.find((s) => s.id === selectedId) ?? null;
  const detailSchool = schools.find((s) => s.id === detailId) ?? null;

  /**
   * 경보 승격·해제 판정.
   * 지속 조건(RISE_HOLD/CLEAR_HOLD)이 있어 갱신 때마다 현재 시각을 넣어 돌린다.
   */
  useEffect(() => {
    if (!now) return;
    setAlarms(stepAlarms(alarmState.current, schools, now));
  }, [schools, now]);

  const shown = autoPopup ? alarms.slice(0, MAX_POPUPS) : [];
  const overflow = autoPopup ? Math.max(0, alarms.length - MAX_POPUPS) : 0;

  /**
   * 오토파일럿 — 아무도 조작하지 않아도 화면이 알아서 돈다.
   *
   * 이 화면은 본청 모니터에 종일 떠 있고 사람은 간헐적으로 쳐다본다.
   * 마우스를 잡는 건 상세·과거 조회를 할 때뿐이므로, 평소에는 대시보드가
   * 스스로 문제 학교를 찾아가 보여주고 전체 지도로 돌아와야 한다.
   *
   * 판단은 lib/autopilot.ts가 하고 여기서는 시계만 돌린다. 섞으면
   * "지금 왜 이 학교가 떴는지" 추적이 안 된다.
   */
  const [pilot, setPilot] = useState(() => createAutopilot(0));
  /** 자동 순회 on/off. 관제자가 완전히 끌 수 있어야 한다. */
  const [autoTour, setAutoTour] = useState(true);
  /**
   * 오토파일럿 전용 시계.
   *
   * 데이터 갱신용 now(5초 주기)를 같이 쓰면 남은 시간 표시가 최대 5초 낡아
   * "17초 후"처럼 체류 시간(15초)을 넘는 값이 나온다. 1초마다 갱신되는
   * 이 시계 하나로 판단과 표시를 모두 맞춘다.
   */
  const [pilotNow, setPilotNow] = useState(0);
  /**
   * 최신 경보 목록을 인터벌에 전달하는 통로.
   *
   * 경보는 5초마다 새 배열로 바뀌는데, 이걸 인터벌 의존성에 넣으면 5초마다
   * 타이머가 재생성돼 체류 시간이 영영 차지 않는다. ref로 우회하되
   * 렌더 중 쓰기는 금지(React 경고)라 이펙트에서 갱신한다.
   */
  const alarmsRef = useRef<Alarm[]>([]);
  useEffect(() => {
    alarmsRef.current = alarms;
  }, [alarms]);

  useEffect(() => {
    if (!autoTour) return;
    const id = setInterval(() => {
      const t = Date.now();
      setPilotNow(t);
      setPilot((p) => stepAutopilot(p, alarmsRef.current, t));
    }, PILOT_MS);
    return () => clearInterval(id);
  }, [autoTour]);

  /**
   * 조작 감지 — 관제자가 손을 대면 즉시 멈추고 60초 뒤 재개한다.
   *
   * mousemove까지 듣는 이유: 클릭만 보면 "지도를 들여다보려고 마우스를
   * 올려둔" 상태에서 화면이 멋대로 다음 학교로 넘어간다.
   *
   * 멈춤 상태에서도 리스너를 유지해야 한다. 조작이 이어지는 동안에는
   * lastInteraction이 계속 갱신돼 재개 시계가 다시 시작되어야 하기 때문이다.
   */
  useEffect(() => {
    if (!autoTour) return;
    let last = 0;
    const onAct = () => {
      const t = Date.now();
      // 마우스 이동은 초당 수십 번 들어온다. 상태 갱신을 0.5초로 솎는다.
      if (t - last < 500) return;
      last = t;
      setPilot((p) => interact(p, t));
    };
    const opts = { passive: true } as const;
    window.addEventListener('mousemove', onAct, opts);
    window.addEventListener('mousedown', onAct, opts);
    window.addEventListener('wheel', onAct, opts);
    window.addEventListener('keydown', onAct, opts);
    window.addEventListener('touchstart', onAct, opts);
    return () => {
      window.removeEventListener('mousemove', onAct);
      window.removeEventListener('mousedown', onAct);
      window.removeEventListener('wheel', onAct);
      window.removeEventListener('keydown', onAct);
      window.removeEventListener('touchstart', onAct);
    };
  }, [autoTour]);

  const focusId = autoTour && pilot.phase === 'focus' ? pilot.focusId : null;
  const focusSchool = schools.find((s) => s.id === focusId) ?? null;
  // 라벨과 남은 시간 모두 pilotNow를 쓴다. 두 시계를 섞으면 표시가 어긋난다.
  const pilotText = autoTour ? autopilotLabel(pilot, alarms.length, pilotNow) : '자동 순회 꺼짐';
  const dwellLeft = Math.max(0, Math.ceil((DWELL_MS - (pilotNow - pilot.since)) / 1000));

  /**
   * 상세 창을 열면 순회를 멈춘다.
   *
   * 조작 감지(mousemove)로도 멈추지만, 상세를 연 뒤 마우스를 떼고 읽기만 하면
   * 60초 뒤 재개돼 화면이 바뀐다. 명시적으로 멈춰 둔다.
   */
  const openDetail = (id: string) => {
    setDetailId(id);
    setPilot((p) => interact(p, Date.now()));
  };

  /**
   * Esc로 열린 것을 닫는다.
   *
   * 벽면 모니터 앞에서는 마우스가 멀리 있는 경우가 많다. 패널을 열어
   * 두고 자리를 뜨면 무인 감시가 가려지므로, 키 하나로 바탕 지도까지
   * 돌아갈 길을 둔다.
   *
   * 닫는 순서는 위에 뜬 것부터다. 상세 → 패널 순으로 한 번에 한 겹씩
   * 벗긴다. 한 번에 전부 닫으면 상세를 보다 Esc를 눌렀을 때 지도까지
   * 튕겨 나와 맥락을 잃는다.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (detailId) {
        setDetailId(null);
        return;
      }
      if (selectedId) {
        setSelectedId(null);
        return;
      }
      setView('map');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailId, selectedId]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#090B0F] text-[#E6E8EB]">
      {/*
        헤더 자동 숨김 — 2026-10-26 대표님 지시.
        "헤더는 평상시 가려져 있다가 마우스를 갖다대면 나오게 해줘"

        무인 관제 화면이라 평소엔 지도와 경보만 보이면 된다. 메뉴가 늘
        떠 있으면 56px을 상시 먹고, 멀리서 볼 때 정작 중요한 지도가
        그만큼 줄어든다.

        화면 맨 위 12px 띠에 마우스가 닿으면 내려오고, 헤더 밖으로
        나가면 다시 올라간다. 감지 띠를 따로 두는 이유는, 헤더가 숨은
        상태에서는 헤더 자신이 화면 밖(-100%)에 있어 마우스 이벤트를
        받지 못하기 때문이다.

        헤더는 absolute로 띄워 자리를 차지하지 않는다. flex 항목으로
        두면 숨겨도 레이아웃이 그대로라 지도가 넓어지지 않는다.

        감지 띠에 navOpen일 때 pointer-events-none을 주는 이유
        ------------------------------------------------------
        처음엔 띠를 z-50으로 늘 켜 뒀더니 헤더가 내려와도 다시 숨지
        않았다. 띠(0~12px)가 내려온 헤더 위를 덮고 있어서, 헤더 상단
        12px에 마우스가 있으면 헤더가 아니라 띠가 이벤트를 받는다.
        그 상태로 마우스를 밖으로 빼면 헤더의 mouseleave가 뜨는 즉시
        띠의 mouseenter가 다시 열어 버려 영영 닫히지 않는다.
        열려 있는 동안에는 띠를 비활성화해 헤더가 직접 받게 한다.
      */}
      <div
        onMouseEnter={() => setNavOpen(true)}
        className={`absolute inset-x-0 top-0 z-40 h-3 ${navOpen ? 'pointer-events-none' : ''}`}
        aria-hidden
      />
      <div
        onMouseLeave={() => setNavOpen(false)}
        className={`absolute inset-x-0 top-0 z-50 transition-transform duration-200 ${
          navOpen ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <TopNav
          siteCount={SITE_COUNT}
          counts={counts}
          updatedAt={updatedAt}
          view={view}
          onNavigate={(v) => {
            // 같은 메뉴를 다시 누르면 닫힌다. 토글로 둬야 벽면 모니터
            // 앞에서 마우스만으로 빠져나올 수 있다.
            //
            // '경고 학교'(alerts)는 전용 패널이 없다. 경보 카드(AlarmGrid)가
            // 이미 바탕 화면에 떠 있으므로, 덮는 패널을 닫아 그걸 보여주는 게
            // 맞다. 빈 패널을 띄우면 있는 정보를 오히려 가린다.
            setView((cur) => {
              const next = cur === v ? 'map' : v;
              return next === 'alerts' ? 'map' : next;
            });
            // 메뉴를 쓰는 순간은 사람이 개입한 것이므로 순회를 멈춘다.
            setPilot((p) => interact(p, Date.now()));
          }}
          schools={schools}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <KakaoMap
              schools={schools}
              selectedId={selectedId}
              onSelect={setSelectedId}
              outdoor={showOutdoor ? outdoor : null}
              focusId={focusId}
              focusLevel={FOCUS_LEVEL}
            />

            <span
              className={`absolute left-4 z-20 rounded-md border border-[#F5A623]/35 bg-[#0C1015]/90 px-2 py-1 text-[11px] font-medium text-[#F5A623] backdrop-blur transition-[top] duration-200 ${
                navOpen ? 'top-[60px]' : 'top-4'
              }`}
            >
              학교명·위치 실제 · 측정값은 목업
            </span>

            {/*
              오토파일럿 상태. 화면이 저절로 움직이는 이유를 관제자가 알아야
              한다. 안내가 없으면 '지도가 멋대로 움직인다'는 고장으로 읽힌다.
            */}
            <span
              className={`absolute left-4 z-20 rounded-md border px-2 py-1 text-[11px] font-medium backdrop-blur transition-[top] duration-200 ${navOpen ? 'top-[104px]' : 'top-12'} ${
                pilot.phase === 'paused' || !autoTour
                  ? 'border-[#79828F]/35 bg-[#0C1015]/90 text-[#79828F]'
                  : 'border-[#2DE1E1]/35 bg-[#0C1015]/90 text-[#2DE1E1]'
              }`}
            >
              {pilotText}
            </span>

            {/* 헤더가 내려오면 버튼이 그 아래에 깔린다. 헤더 높이(약 56px)만큼
                밀어 두 요소가 겹치지 않게 한다. 숨은 평상시엔 원래 자리로. */}
            <div
              className={`absolute right-4 z-20 flex gap-1.5 transition-[top] duration-200 ${
                navOpen ? 'top-[60px]' : 'top-4'
              }`}
            >
              {[
                { on: showOutdoor, set: setShowOutdoor, label: '실외 대기질' },
                { on: showMatrix, set: setShowMatrix, label: '진단' },
                { on: autoPopup, set: setAutoPopup, label: '자동 팝업' },
                { on: autoTour, set: setAutoTour, label: '자동 순회' },
              ].map((b) => (
                <button
                  key={b.label}
                  onClick={() => b.set((v) => !v)}
                  aria-pressed={b.on}
                  className={`rounded-lg border px-2.5 py-1.5 text-[12px] backdrop-blur transition-colors ${
                    b.on
                      ? 'border-[#2DE1E1]/45 bg-[#132027] text-[#2DE1E1]'
                      : 'border-[#232A35] bg-[#0C1015]/90 text-[#79828F] hover:text-[#C9CFD8]'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            {/* 문제 학교 자동 팝업. 나쁨 이상이 유지되면 뜨고, 호전되면 자동으로 닫힌다. */}
            <AlarmGrid alarms={shown} schools={schools} now={now} onOpen={openDetail} navOpen={navOpen} />

            {/* 자동 순회로 확대한 학교의 그래프. 지도를 다 덮지 않게 우측에 붙인다. */}
            {focusSchool && !detailSchool && (
              <AutoTourPopup
                school={focusSchool}
                secondsLeft={dwellLeft}
                outdoor={outdoor[regionOf(focusSchool.lat, focusSchool.lng)]}
                onOpenDetail={openDetail}
              />
            )}
            {overflow > 0 && (
              <div className="pointer-events-none absolute bottom-4 right-4 z-40 rounded-lg border border-[#F00000]/45 bg-[#12161D]/95 px-3 py-1.5 text-[12px] font-medium text-[#F00000] backdrop-blur">
                외 {overflow}개교 경보
              </div>
            )}

            {selected && <DetailPanel school={selected} onClose={() => setSelectedId(null)} />}
            {detailSchool && (
              <AlarmDetail
                school={detailSchool}
                onClose={() => setDetailId(null)}
                onOpenHistory={() => {
                  setSelectedId(detailSchool.id);
                  setDetailId(null);
                  setView('history');
                }}
              />
            )}
            {showMatrix && (
              <DiagnosticMatrix
                schools={schools}
                diagnoses={diagnoses}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onClose={() => setShowMatrix(false)}
              />
            )}
            {showHistory && (
              <HistoryPanel
                schools={schools}
                initialSchoolId={selectedId}
                now={new Date()}
                onClose={() => setView('map')}
              />
            )}

            {/*
              헤더 메뉴 패널.
              화면을 덮는 전체 패널이라 한 번에 하나만 뜬다(view 단일 상태).
              닫으면 'map'으로 돌아가 오토파일럿이 이어서 돈다.
            */}
            {view === 'overview' && (
              <OverviewPanel
                schools={schools}
                counts={counts}
                alarms={alarms}
                now={Date.now()}
                onClose={() => setView('map')}
                onSelect={(id) => {
                  setView('map');
                  openDetail(id);
                }}
              />
            )}
            {view === 'zones' && (
              <ZoneGridPanel
                schools={schools}
                onClose={() => setView('map')}
                onSelect={(id) => {
                  setView('map');
                  openDetail(id);
                }}
              />
            )}
            {view === 'outdoor' && (
              <OutdoorPanel
                schools={schools}
                outdoor={outdoor}
                onClose={() => setView('map')}
                onSelect={(id) => {
                  setView('map');
                  openDetail(id);
                }}
              />
            )}
            {/*
              '알림'(notify)과 '경고 학교'(alerts)는 다른 화면이다.
              알림  = 경보가 언제 올라왔고 언제 풀리는지, 시간 흐름을 본다.
              경고 학교 = 지금 나쁜 학교를 지도 위 카드로 본다(AlarmGrid, 바탕 화면).
              AlertsPanel의 제목이 '알림'이므로 notify에 붙인다.
            */}
            {view === 'notify' && (
              <AlertsPanel
                alarms={alarms}
                schools={schools}
                now={Date.now()}
                onClose={() => setView('map')}
                onSelect={(id) => {
                  setView('map');
                  openDetail(id);
                }}
              />
            )}

            {/*
              아직 만들지 못한 메뉴. 빈 화면 대신 "무엇이 없어서 못 만드는지"를
              밝힌다. 그럴듯한 가짜를 그리면 교육청 시연에서 실제 자료로 읽힌다.
            */}
            {view === 'floorplan' && (
              <PendingPanel
                title="조리실 도면"
                purpose="조리실 평면도 위에 센서 설치 위치를 표시해 어느 지점이 나쁜지 보여줍니다."
                blockers={[
                  '학교별 조리실 평면도 미확보',
                  '센서 설치 좌표(평면도상 위치) 미확보',
                ]}
                unblock="학교별 평면도와 센서 설치 위치를 받으면 화면에 올릴 수 있습니다."
                onClose={() => setView('map')}
              />
            )}
            {view === 'report' && (
              <PendingPanel
                title="보고서"
                purpose="기간별 공기질 현황을 교육청 제출용 문서로 내보냅니다."
                blockers={[
                  '제출 양식·주기 미확정',
                  '원본 로그 제출인지 요약 보고서인지 미확정',
                  '데이터 보존 기간 미확정',
                ]}
                unblock="교육청 요구 양식과 제출 주기가 정해지면 그 형식에 맞춰 만듭니다."
                onClose={() => setView('map')}
              />
            )}

            <p className="pointer-events-none absolute bottom-3 left-5 text-[11px] text-[#3E4653]">
              {REFRESH_MS / 1000}초 간격 갱신 · 학교명·좌표는 실제, 공기질 측정값과 진단은 목업
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
