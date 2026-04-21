'use client';

import {useCallback, useEffect, useState} from 'react';
import {ArrowLeft, Check, Loader2, LogOut} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {INTEREST_OPTIONS} from '@forme/shared/config';
import {cn} from '@/lib/utils';
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
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto space-y-10">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 w-full rounded-sm" />
        <Skeleton className="h-60 w-full rounded-sm" />
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-2xl mx-auto space-y-10">
      {/* Masthead */}
      <div className="flex items-baseline gap-3 pb-3 border-b border-border">
        <Link
          href="/dashboard"
          aria-label="대시보드로 돌아가기"
          className="rounded-sm p-1 -ml-1 text-muted-foreground hover:text-foreground transition-colors shrink-0 relative -top-0.5"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground shrink-0">
            <span className="text-primary" aria-hidden="true">—</span> Profile
          </span>
          <h1 className="font-display text-2xl sm:text-3xl leading-none text-foreground truncate">
            내 프로필
          </h1>
        </div>
      </div>

      {/* Account Info */}
      <section className="space-y-5">
        <div className="flex items-baseline gap-3 pb-2 border-b border-border/60">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span className="text-primary" aria-hidden="true">—</span> Account
          </span>
        </div>
        <div className="flex items-center gap-4">
          {profile?.avatarUrl ? (
            <Image
              src={profile.avatarUrl}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-full ring-1 ring-border ring-offset-2 ring-offset-background"
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-border ring-offset-2 ring-offset-background">
              <span className="text-lg font-semibold text-primary">
                {(profile?.displayName ?? profile?.discordUsername ?? 'U')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
            </div>
          )}
          <div className="space-y-0.5 min-w-0">
            <p className="font-display text-lg leading-snug truncate">
              {profile?.displayName ?? profile?.discordUsername}
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground truncate">
              @{profile?.discordUsername}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="display-name" className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Display name
          </Label>
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
      </section>

      {/* Interests */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between pb-2 border-b border-border/60">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span className="text-primary" aria-hidden="true">—</span> Interests · {selectedInterests.length}/{MAX_INTERESTS}
          </span>
          {selectedInterests.length < MIN_INTERESTS && (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-destructive">
              min {MIN_INTERESTS}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          관심사를 선택하면 맞춤 피드 추천을 받을 수 있어요.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {INTEREST_OPTIONS.map((tag) => {
            const isSelected = selectedInterests.includes(tag);
            const isDisabled = !isSelected && selectedInterests.length >= MAX_INTERESTS;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleInterest(tag)}
                disabled={isDisabled}
                className={cn(
                  'inline-flex items-baseline gap-1.5 text-xs transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-sm',
                  isSelected
                    ? 'text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground',
                  isDisabled && 'opacity-40 cursor-not-allowed',
                )}
              >
                {isSelected && <span aria-hidden="true" className="font-mono text-[11px]">—</span>}
                {tag}
              </button>
            );
          })}
        </div>
      </section>

      {/* Push Notifications */}
      <NotificationSettings />

      {/* Error */}
      {error && (
        <p
          role="alert"
          className="font-mono text-xs tracking-[0.02em] text-destructive border-l-2 border-destructive pl-3 py-1"
        >
          {error}
        </p>
      )}

      {/* Save + Logout */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={async () => {
            const {createClient} = await import('@/lib/supabase/client');
            const supabase = createClient();
            await supabase.auth.signOut();
            window.location.href = '/login';
          }}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
        >
          <LogOut className="h-3 w-3" aria-hidden="true" />
          Sign out
        </button>
        <Button
          onClick={handleSave}
          disabled={saving || selectedInterests.length < MIN_INTERESTS}
          className="min-w-[100px]"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : success ? (
            <>
              <Check className="h-4 w-4 mr-1" aria-hidden="true" />
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
