'use client';

import {useCallback, useEffect, useState} from 'react';
import {ArrowLeft, Check, Loader2, LogOut, User} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {INTEREST_OPTIONS} from '@forme/shared/config';
import {cn} from '@/lib/utils';
import {Card, CardContent, CardHeader} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Skeleton} from '@/components/ui/skeleton';
import {NotificationSettings} from '@/components/features/push/notification-settings';

interface ProfileData {
  id: string;
  userId: string;
  discordUsername: string;
  displayName: string | null;
  avatarUrl: string | null;
  interests: string[];
  createdAt: string;
  updatedAt: string;
}

const MIN_INTERESTS = 3;
const MAX_INTERESTS = 6;

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Editable fields
  const [displayName, setDisplayName] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/profile');
      if (!res.ok) throw new Error('Failed to fetch profile');
      const data = await res.json();
      setProfile(data);
      setDisplayName(data.displayName ?? data.discordUsername ?? '');
      setSelectedInterests(data.interests ?? []);
    } catch {
      setError('프로필을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const toggleInterest = (tag: string) => {
    setSelectedInterests((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      if (prev.length >= MAX_INTERESTS) return prev;
      return [...prev, tag];
    });
    setSuccess(false);
  };

  const handleSave = async () => {
    if (selectedInterests.length < MIN_INTERESTS) {
      setError(`관심사를 최소 ${MIN_INTERESTS}개 선택해주세요.`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          interests: selectedInterests,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? '저장에 실패했습니다.');
      }

      const updated = await res.json();
      setProfile(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-2xl mx-auto space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg p-2 -ml-2 hover:bg-accent transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Profile
          </p>
          <h1 className="text-xl font-semibold tracking-tight">내 프로필</h1>
        </div>
      </div>

      {/* Account Info */}
      <Card className="border-border/60 shadow-none">
        <CardHeader className="px-4 py-3 pb-0">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <User className="h-4 w-4" />
            </div>
            <p className="text-sm font-semibold">기본 정보</p>
          </div>
        </CardHeader>
        <CardContent className="px-4 py-4 space-y-4">
          <div className="flex items-center gap-4">
            {profile?.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt=""
                width={56}
                height={56}
                className="h-14 w-14 rounded-full ring-2 ring-border ring-offset-2 ring-offset-background"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-border ring-offset-2 ring-offset-background">
                <span className="text-lg font-semibold text-primary">
                  {(profile?.displayName ?? profile?.discordUsername ?? 'U')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
              </div>
            )}
            <div className="space-y-0.5">
              <p className="font-semibold">
                {profile?.displayName ?? profile?.discordUsername}
              </p>
              <p className="text-sm text-muted-foreground">
                @{profile?.discordUsername}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">닉네임</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setSuccess(false);
              }}
              placeholder="표시할 이름"
              maxLength={255}
            />
          </div>
        </CardContent>
      </Card>

      {/* Interests */}
      <Card className="border-border/60 shadow-none">
        <CardHeader className="px-4 py-3 pb-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">관심사</p>
            <p className="text-xs text-muted-foreground">
              {selectedInterests.length}/{MAX_INTERESTS}개 선택
              {selectedInterests.length < MIN_INTERESTS && (
                <span className="text-destructive ml-1">
                  (최소 {MIN_INTERESTS}개)
                </span>
              )}
            </p>
          </div>
        </CardHeader>
        <CardContent className="px-4 py-4">
          <p className="text-xs text-muted-foreground mb-3">
            관심사를 선택하면 맞춤 피드 추천을 받을 수 있어요.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {INTEREST_OPTIONS.map((tag) => {
              const isSelected = selectedInterests.includes(tag);
              const isDisabled =
                !isSelected && selectedInterests.length >= MAX_INTERESTS;

              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleInterest(tag)}
                  disabled={isDisabled}
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium',
                    'transition-all cursor-pointer ring-1 ring-inset',
                    isSelected
                      ? 'bg-primary/15 text-primary ring-primary/30'
                      : 'text-muted-foreground ring-border hover:bg-accent hover:text-accent-foreground',
                    isDisabled && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <NotificationSettings />

      {/* Error / Success */}
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      {/* Save + Logout */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={async () => {
            const {createClient} = await import('@/lib/supabase/client');
            const supabase = createClient();
            await supabase.auth.signOut();
            window.location.href = '/login';
          }}
          className="ml-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          로그아웃
        </button>
        <Button
          onClick={handleSave}
          disabled={saving || selectedInterests.length < MIN_INTERESTS}
          className="min-w-[100px]"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : success ? (
            <>
              <Check className="h-4 w-4 mr-1" />
              저장됨
            </>
          ) : (
            '저장'
          )}
        </Button>
      </div>
    </div>
  );
}
