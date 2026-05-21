import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '현장 소모품 구매 시스템',
  description: 'Field Procurement Management System',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}
