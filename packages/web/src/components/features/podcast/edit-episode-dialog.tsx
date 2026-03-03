'use client';

import {useEffect, useState} from 'react';
import {Loader2, Save} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,} from '@/components/ui/dialog';
import {cn} from '@/lib/utils';
import type {Episode} from './player-context';

interface EditEpisodeDialogProps {
  episode: Episode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (updated: Episode) => void;
}

export function EditEpisodeDialog({
  episode,
  open,
  onOpenChange,
  onSuccess,
}: EditEpisodeDialogProps) {
  const [title, setTitle] = useState(episode.title);
  const [description, setDescription] = useState(episode.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTitle(episode.title);
    setDescription(episode.description ?? '');
    setError('');
  }, [episode.id, episode.title, episode.description]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/podcast/episodes/${episode.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '수정에 실패했습니다.');
      }

      const updated = await res.json();
      onSuccess({ ...episode, title: updated.title, description: updated.description });
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>에피소드 편집</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">제목 *</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-desc">설명 (선택)</Label>
            <textarea
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              rows={3}
              className={cn(
                'flex w-full rounded-md border border-input bg-background px-3 py-2',
                'text-sm placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50 resize-none'
              )}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button type="submit" disabled={!title.trim() || saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              저장
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
