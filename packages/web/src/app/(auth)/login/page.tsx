'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const [isLoading, setIsLoading] = useState(false);

  const handleDiscordLogin = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const rawRedirect = searchParams.get('redirect') ?? '/dashboard';
      const redirectPath = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
        ? rawRedirect
        : '/dashboard';

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`,
        },
      });

      if (oauthError) {
        console.error('OAuth error:', oauthError);
        setIsLoading(false);
      }
    } catch (e) {
      console.error('Login error:', e);
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm border-border shadow-sm animate-in fade-in slide-in-from-bottom-3 duration-300 ease-out">
      <CardHeader className="pb-5 pt-8 px-8 space-y-4">
        <div className="flex justify-center">
          <div className="relative w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 ring-1 ring-primary/20">
            <span className="text-primary-foreground text-base font-bold tracking-tight select-none leading-none">
              fm
            </span>
          </div>
        </div>

        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            로그인
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            나만의 큐레이션, 메모, 팟캐스트
          </p>
        </div>
      </CardHeader>

      <CardContent className="px-8 pb-8 space-y-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 px-3.5 py-3 text-sm text-destructive bg-destructive/8 rounded-xl border border-destructive/15 animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <svg
              className="w-4 h-4 mt-0.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>로그인에 실패했습니다. 다시 시도해 주세요.</span>
          </div>
        )}

        <Button
          onClick={handleDiscordLogin}
          disabled={isLoading}
          aria-busy={isLoading}
          className="w-full h-12 bg-[#5865F2] hover:bg-[#4752C4] active:bg-[#3c45a5] text-white font-medium text-[15px] rounded-xl transition-all duration-150 disabled:opacity-70"
        >
          {isLoading ? (
            <>
              <svg
                className="w-4 h-4 mr-2 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              로그인 중...
            </>
          ) : (
            <>
              <svg
                className="w-5 h-5 mr-2 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              Discord로 로그인
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function LoginSkeleton() {
  return (
    <Card className="w-full max-w-sm border-border shadow-sm">
      <CardHeader className="pb-5 pt-8 px-8 space-y-4">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/25 ring-1 ring-primary/20">
            <span className="text-primary-foreground text-base font-bold tracking-tight select-none leading-none">
              fm
            </span>
          </div>
        </div>
        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            로그인
          </h1>
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        </div>
      </CardHeader>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 py-12 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]">
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, hsl(199 89% 48% / 0.08) 0%, transparent 60%)',
        }}
      />
      <Suspense fallback={<LoginSkeleton />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
