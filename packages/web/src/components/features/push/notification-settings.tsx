'use client';

import {useCallback, useEffect, useState} from 'react';
import {Bell, BellOff, Loader2, Send} from 'lucide-react';
import {Card, CardContent, CardHeader} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {cn} from '@/lib/utils';

type PushState = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function NotificationSettings() {
  const [pushState, setPushState] = useState<PushState>('loading');
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const checkPushState = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushState('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setPushState('denied');
      return;
    }

    try {
      const res = await fetch('/api/push/subscribe');
      if (res.ok) {
        const data = await res.json();
        setPushState(data.isSubscribed ? 'subscribed' : 'unsubscribed');
      } else {
        setPushState('unsubscribed');
      }
    } catch {
      setPushState('unsubscribed');
    }
  }, []);

  useEffect(() => {
    checkPushState();
  }, [checkPushState]);

  const handleSubscribe = async () => {
    setToggling(true);
    setMessage(null);

    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setMessage({ type: 'error', text: '푸시 알림 설정이 올바르지 않습니다.' });
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const applicationServerKey = urlBase64ToUint8Array(vapidKey);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });

      const subJson = subscription.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys!.p256dh,
            auth: subJson.keys!.auth,
          },
        }),
      });

      if (res.ok) {
        setPushState('subscribed');
        setMessage({ type: 'success', text: '알림이 활성화되었습니다' });
      } else {
        await subscription.unsubscribe();
        setMessage({ type: 'error', text: '구독 저장에 실패했습니다' });
      }
    } catch {
      if (Notification.permission === 'denied') {
        setPushState('denied');
        setMessage({ type: 'error', text: '브라우저에서 알림이 차단되어 있습니다. 설정에서 허용해주세요.' });
      } else {
        setMessage({ type: 'error', text: '알림 활성화에 실패했습니다' });
      }
    } finally {
      setToggling(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleUnsubscribe = async () => {
    setToggling(true);
    setMessage(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }

      setPushState('unsubscribed');
      setMessage({ type: 'success', text: '알림이 비활성화되었습니다' });
    } catch {
      setMessage({ type: 'error', text: '알림 비활성화에 실패했습니다' });
    } finally {
      setToggling(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleTestPush = async () => {
    setTesting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const data = await res.json();

      if (res.ok && data.sent > 0) {
        setMessage({ type: 'success', text: '테스트 알림을 전송했습니다' });
      } else {
        setMessage({ type: 'error', text: '전송할 활성 구독이 없습니다' });
      }
    } catch {
      setMessage({ type: 'error', text: '테스트 알림 전송에 실패했습니다' });
    } finally {
      setTesting(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const isSubscribed = pushState === 'subscribed';

  return (
    <Card className="border-border/60 shadow-none">
      <CardHeader className="px-4 py-3 pb-0">
        <div className="flex items-center gap-2">
          <div className={cn(
            'rounded-lg p-2',
            isSubscribed ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}>
            {isSubscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
          </div>
          <p className="text-sm font-semibold">푸시 알림</p>
        </div>
      </CardHeader>
      <CardContent className="px-4 py-4 space-y-3">
        {pushState === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            확인 중...
          </div>
        )}

        {pushState === 'unsupported' && (
          <p className="text-sm text-muted-foreground">
            이 브라우저는 푸시 알림을 지원하지 않습니다.
          </p>
        )}

        {pushState === 'denied' && (
          <p className="text-sm text-muted-foreground">
            브라우저에서 알림이 차단되어 있습니다.
            <br />
            <span className="text-xs">브라우저 설정에서 알림을 허용해주세요.</span>
          </p>
        )}

        {(pushState === 'subscribed' || pushState === 'unsubscribed') && (
          <>
            <p className="text-xs text-muted-foreground">
              {isSubscribed
                ? '캘린더 리마인더, 큐레이션 알림 등을 받을 수 있습니다.'
                : '알림을 활성화하면 리마인더와 알림을 받을 수 있습니다.'}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant={isSubscribed ? 'outline' : 'default'}
                size="sm"
                onClick={isSubscribed ? handleUnsubscribe : handleSubscribe}
                disabled={toggling}
                className="text-xs"
              >
                {toggling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : isSubscribed ? (
                  <BellOff className="h-3.5 w-3.5 mr-1" />
                ) : (
                  <Bell className="h-3.5 w-3.5 mr-1" />
                )}
                {isSubscribed ? '알림 끄기' : '알림 켜기'}
              </Button>

              {isSubscribed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTestPush}
                  disabled={testing}
                  className="text-xs"
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Send className="h-3.5 w-3.5 mr-1" />
                  )}
                  테스트
                </Button>
              )}
            </div>
          </>
        )}

        {message && (
          <p className={cn(
            'text-xs',
            message.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
          )}>
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
