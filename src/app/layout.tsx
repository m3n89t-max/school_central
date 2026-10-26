import type { Metadata } from 'next';
import './globals.css';
import ViewportScale from '@/components/ViewportScale';

export const metadata: Metadata = {
  title: 'VAQ 센트럴 — 제주 조리실 공기질 관제',
  description: '제주 학교 급식실 공기질 중앙관제 대시보드',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {/*
          화면 크기에 맞춰 UI 전체 배율을 맞춘다.
          관제실 모니터 해상도가 미확인이라 px 고정으로는 4K에서 글자가
          절반으로 보인다. 해상도를 묻는 대신 화면이 알아서 맞추게 한다.
        */}
        <ViewportScale />
        {children}
      </body>
    </html>
  );
}
