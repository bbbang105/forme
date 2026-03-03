import type {Metadata} from 'next';
import {ThemeProvider} from 'next-themes';
import {ServiceWorkerRegister} from '@/components/sw-register';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'forme',
    template: '%s | forme',
  },
  description: '개인 올인원 PWA - 큐레이션, 캘린더, 메모, 팟캐스트',
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
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0ea5e9" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
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
