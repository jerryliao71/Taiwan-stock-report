import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://jerryliao71.github.io/Taiwan-stock-report/'),
  title: '台股估值雷達',
  description: '分欄呈現 Excel 原表、官方實績與規則型 EPS／PE 情境的台股研究工作台。',
  openGraph: {
    type: 'website',
    locale: 'zh_TW',
    url: '/',
    siteName: '台股估值雷達',
    title: '台股估值雷達',
    description: '自動更新行情、EPS 財測與估值訊號。',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '台股估值雷達' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '台股估值雷達',
    description: '自動更新行情、EPS 財測與估值訊號。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
