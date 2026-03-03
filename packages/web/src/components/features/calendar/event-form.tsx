'use client';

import {useState, useTransition} from 'react';
import {format} from 'date-fns';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {createCalendarEvent, deleteCalendarEvent, updateCalendarEvent,} from '@/lib/actions/calendar';
import {Trash2} from 'lucide-react';

const EVENT_COLORS = [
  { value: '#3b82f6', label: '파랑' },
  { value: '#f43f5e', label: '빨강' },
  { value: '#a855f7', label: '보라' },
  { value: '#10b981', label: '초록' },
  { value: '#f59e0b', label: '노랑' },
  { value: '#6b7280', label: '회색' },
];

interface CalendarEventData {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  color: string;
  description: string | null;
}

interface EventFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEventData | null;
  defaultDate?: string;
  onSuccess: () => void;
}

export function EventForm({
  open,
  onOpenChange,
  event,
  defaultDate,
  onSuccess,
}: EventFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <EventFormContent
          event={event}
          defaultDate={defaultDate}
          onOpenChange={onOpenChange}
          onSuccess={onSuccess}
        />
      )}
    </Dialog>
  );
}

function EventFormContent({
  event,
  defaultDate,
  onOpenChange,
  onSuccess,
}: {
  event?: CalendarEventData | null;
  defaultDate?: string;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const isEditing = !!event;
  const [title, setTitle] = useState(event?.title ?? '');
  const [startDate, setStartDate] = useState(
    event?.startDate ?? defaultDate ?? format(new Date(), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(
    event?.endDate ?? defaultDate ?? format(new Date(), 'yyyy-MM-dd')
  );
  const [color, setColor] = useState(event?.color ?? '#3b82f6');
  const [description, setDescription] = useState(event?.description ?? '');
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      try {
        if (isEditing && event) {
          await updateCalendarEvent(event.id, {
            title,
            startDate,
            endDate,
            color,
            description: description || null,
          });
        } else {
          await createCalendarEvent({
            title,
            startDate,
            endDate,
            color,
            description: description || undefined,
          });
        }
        onOpenChange(false);
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : '저장에 실패했습니다');
      }
    });
  };

  const handleDelete = () => {
    if (!event) return;
    setError('');
    startTransition(async () => {
      try {
        await deleteCalendarEvent(event.id);
        onOpenChange(false);
        onSuccess();
      } catch (err) {
        setError(err instanceof Error ? err.message : '삭제에 실패했습니다');
      }
    });
  };

  return (
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? '일정 수정' : '새 일정'}</DialogTitle>
          <DialogDescription>
            {isEditing ? '일정 정보를 수정하세요' : '새로운 일정을 추가하세요'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="event-title">제목</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="일정 제목"
              maxLength={200}
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="event-start">시작일</Label>
              <Input
                id="event-start"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-end">종료일</Label>
              <Input
                id="event-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>색상</Label>
            <div className="flex gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className="w-7 h-7 rounded-full transition-all border-2"
                  style={{
                    backgroundColor: c.value,
                    borderColor: color === c.value ? 'var(--foreground)' : 'transparent',
                    transform: color === c.value ? 'scale(1.15)' : 'scale(1)',
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-desc">메모 (선택)</Label>
            <textarea
              id="event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="간단한 메모..."
              rows={2}
              maxLength={2000}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          <DialogFooter className="gap-2">
            {isEditing && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isPending}
                className="mr-auto text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                삭제
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              취소
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? '저장 중...' : isEditing ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </form>

        {/* Delete confirmation dialog */}
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>일정을 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{event?.title}&rdquo; 일정이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
  );
}
