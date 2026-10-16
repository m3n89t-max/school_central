import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VAQ 센트럴 — 제주 조리실 공기질 관제',
  description: '제주 학교 급식실 공기질 중앙관제 대시보드',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
