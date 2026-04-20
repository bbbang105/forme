import type {Metadata, Viewport} from 'next';
import {Instrument_Serif, Noto_Serif_KR} from 'next/font/google';
import {ThemeProvider} from 'next-themes';
import {ServiceWorkerRegister} from '@/components/sw-register';
import './globals.css';

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

// Korean serif fallback — used when Instrument Serif has no Korean glyph.
// Pairs with `font-synthesis: none` on .font-display so Korean renders upright
// (no synthetic italic skew that was clipping last chars on iOS).
const notoSerifKR = Noto_Serif_KR({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-noto-serif-kr',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: {
    default: 'forme',
    template: '%s | forme',
  },
  description: '개인 올인원 PWA - 피드, 캘린더, 노트',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'forme',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${instrumentSerif.variable} ${notoSerifKR.variable}`}
    >
      <head>
        <meta name="theme-color" content="#F7F2E8" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#1A1714" media="(prefers-color-scheme: dark)" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="preload"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          rel="stylesheet"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
