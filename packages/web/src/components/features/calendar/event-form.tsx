'use client';

import {useState, useTransition} from 'react';
import {format} from 'date-fns';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
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
import {createCalendarEvent, deleteCalendarEvent, updateCalendarEvent} from '@/lib/actions/calendar';
import {MapPin, Trash2} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {CalendarEvent, EventCategory} from './types';
import {RecurrenceForm} from './recurrence-form';

export const EVENT_COLORS = [
  { value: '#3b82f6', label: '파랑' },
  { value: '#f43f5e', label: '빨강' },
  { value: '#a855f7', label: '보라' },
  { value: '#22c55e', label: '초록' },
  { value: '#f59e0b', label: '노랑' },
  { value: '#6b7280', label: '회색' },
  { value: '#8b5cf6', label: '바이올렛' },
  { value: '#ec4899', label: '핑크' },
];

/**
 * Auto-format time input: strips non-digits, inserts colon after 2 digits,
 * clamps hours to 0-23 and minutes to 0-59.
 */
export function formatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  let hh = digits.slice(0, 2);
  let mm = digits.slice(2);
  if (Number(hh) > 23) hh = '23';
  if (mm.length === 2 && Number(mm) > 59) mm = '59';
  return `${hh}:${mm}`;
}

interface EventFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEvent | null;
  defaultDate?: string;
  categories: EventCategory[];
  onEventCreate: (event: CalendarEvent) => void;
  onEventUpdate: (event: CalendarEvent) => void;
  onEventDelete: (eventId: string) => void;
  onManageCategories?: () => void;
  onExcludeDate?: (eventId: string, dateStr: string) => void;
  onDeleteAfter?: (eventId: string, dateStr: string) => void;
}

export function EventForm({
  open,
  onOpenChange,
  event,
  defaultDate,
  categories,
  onEventCreate,
  onEventUpdate,
  onEventDelete,
  onManageCategories,
  onExcludeDate,
  onDeleteAfter,
}: EventFormProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <EventFormContent
          event={event}
          defaultDate={defaultDate}
          categories={categories}
          onOpenChange={onOpenChange}
          onEventCreate={onEventCreate}
          onEventUpdate={onEventUpdate}
          onEventDelete={onEventDelete}
          onManageCategories={onManageCategories}
          onExcludeDate={onExcludeDate}
          onDeleteAfter={onDeleteAfter}
        />
      )}
    </Dialog>
  );
}

function EventFormContent({
  event,
  defaultDate,
  categories,
  onOpenChange,
  onEventCreate,
  onEventUpdate,
  onEventDelete,
  onManageCategories,
  onExcludeDate,
  onDeleteAfter,
}: {
  event?: CalendarEvent | null;
  defaultDate?: string;
  categories: EventCategory[];
  onOpenChange: (open: boolean) => void;
  onEventCreate: (event: CalendarEvent) => void;
  onEventUpdate: (event: CalendarEvent) => void;
  onEventDelete: (eventId: string) => void;
  onManageCategories?: () => void;
  onExcludeDate?: (eventId: string, dateStr: string) => void;
  onDeleteAfter?: (eventId: string, dateStr: string) => void;
}) {
  const isEditing = !!event;
  const [title, setTitle] = useState(event?.title ?? '');
  const [startDate, setStartDate] = useState(
    event?.startDate ?? defaultDate ?? format(new Date(), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(
    event?.endDate ?? defaultDate ?? format(new Date(), 'yyyy-MM-dd')
  );
  const [isAllDay, setIsAllDay] = useState(!event?.startTime);
  const [startTime, setStartTime] = useState(event?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState(event?.endTime ?? '10:00');
  const [color, setColor] = useState(event?.color ?? categories[0]?.color ?? '#3b82f6');
  const [description, setDescription] = useState(event?.description ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(event?.categoryId ?? null);
  const [isRecurring, setIsRecurring] = useState(!!event?.recurrenceType);
  const [recurrenceType, setRecurrenceType] = useState<'weekly' | 'biweekly'>(
    (event?.recurrenceType as 'weekly' | 'biweekly') ?? 'weekly'
  );
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>(event?.recurrenceDays ?? []);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(event?.recurrenceEndDate ?? '');
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleCategorySelect = (cat: EventCategory) => {
    setCategoryId(cat.id);
    setColor(cat.color);
  };

  const toggleDay = (day: number) => {
    setRecurrenceDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      try {
        const eventData = {
          title,
          startDate,
          endDate: isRecurring ? startDate : endDate,
          startTime: isAllDay ? null : startTime,
          endTime: isAllDay ? null : endTime,
          color,
          description: description || null,
          location: location || null,
          categoryId,
          recurrenceType: isRecurring ? recurrenceType : null,
          recurrenceDays: isRecurring ? recurrenceDays : null,
          recurrenceEndDate: isRecurring && recurrenceEndDate ? recurrenceEndDate : null,
        };

        // When editing a recurring instance, use the original event id for the update
        const editId = event?._originalId ?? event?.id;

        if (isEditing && event && editId) {
          const updated = await updateCalendarEvent(editId, eventData);
          if (updated) {
            onEventUpdate(updated as CalendarEvent);
          }
        } else {
          const created = await createCalendarEvent(eventData);
          if (created) {
            onEventCreate(created as CalendarEvent);
          }
        }
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '저장에 실패했습니다');
      }
    });
  };

  const handleDeleteAll = () => {
    if (!event) return;
    setError('');
    const targetId = event._originalId ?? event.id;
    startTransition(async () => {
      try {
        await deleteCalendarEvent(targetId);
        onEventDelete(targetId);
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '삭제에 실패했습니다');
      }
    });
  };

  const handleExcludeDate = () => {
    if (!event?._originalId || !event?._instanceDate) return;
    onExcludeDate?.(event._originalId, event._instanceDate);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const handleDeleteAfterDate = () => {
    if (!event?._originalId || !event?._instanceDate) return;
    onDeleteAfter?.(event._originalId, event._instanceDate);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const isRecurringInstance = !!event?.recurrenceType;

  return (
      <DialogContent className="sm:max-w-md flex flex-col p-0 gap-0" onInteractOutside={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>{isEditing ? '일정 수정' : '새 일정'}</DialogTitle>
          <DialogDescription>
            {isEditing ? '일정 정보를 수정하세요' : '새로운 일정을 추가하세요'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 px-6 pb-6 overflow-y-auto min-h-0 flex-1">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          {/* 제목 */}
          <div className="space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="일정 제목을 입력하세요"
              maxLength={200}
              required
              autoFocus
              className="text-base font-medium border-0 border-b border-border rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
            />
          </div>

          {/* 카테고리 칩 */}
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">카테고리</Label>
                {onManageCategories && (
                  <button
                    type="button"
                    onClick={() => { onOpenChange(false); onManageCategories(); }}
                    className="text-xs text-primary hover:underline"
                  >
                    관리
                  </button>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleCategorySelect(cat)}
                    className={cn(
                      'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition-all shrink-0',
                      categoryId === cat.id
                        ? 'font-medium'
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    )}
                    style={categoryId === cat.id ? {
                      borderColor: cat.color,
                      backgroundColor: `${cat.color}15`,
                      color: cat.color,
                    } : undefined}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 종일 + 반복 토글 (한 줄) */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm">종일</Label>
              <Switch checked={isAllDay} onCheckedChange={setIsAllDay} />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">반복</Label>
              <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
            </div>
          </div>

          {/* 반복 설정 */}
          <div className="space-y-3">

            {isRecurring && (
              <RecurrenceForm
                recurrenceType={recurrenceType}
                onRecurrenceTypeChange={setRecurrenceType}
                recurrenceDays={recurrenceDays}
                onToggleDay={toggleDay}
                recurrenceEndDate={recurrenceEndDate}
                onRecurrenceEndDateChange={setRecurrenceEndDate}
                minDate={startDate}
              />
            )}
          </div>

          {/* 날짜 */}
          <div className={cn('gap-3', isRecurring ? 'grid grid-cols-1' : 'grid grid-cols-2')}>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {isRecurring ? '시작일 (반복 기준일)' : '시작일'}
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!isRecurring && e.target.value > endDate) setEndDate(e.target.value);
                }}
                required
                className="text-sm"
              />
            </div>
            {!isRecurring && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">종료일</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  required
                  className="text-sm"
                />
              </div>
            )}
          </div>

          {/* 시간 (종일이 아닐 때) — 24시간 텍스트 입력 */}
          {!isAllDay && (
            <div className="grid grid-cols-2 gap-3 animate-fade-in">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">시작 시간</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="09:00"
                  value={startTime}
                  onChange={(e) => setStartTime(formatTimeInput(e.target.value))}
                  maxLength={5}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">종료 시간</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="10:00"
                  value={endTime}
                  onChange={(e) => setEndTime(formatTimeInput(e.target.value))}
                  maxLength={5}
                />
              </div>
            </div>
          )}

          {/* 장소 */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              장소
            </Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="장소를 입력하세요 (선택)"
              maxLength={200}
            />
          </div>

          {/* 색상 */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">색상</Label>
            <div className="flex gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className="w-5 h-5 sm:w-6 sm:h-6 rounded-full transition-all border-2"
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

          {/* 메모 */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">메모 (선택)</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="간단한 메모..."
              rows={1}
              maxLength={2000}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>

          <DialogFooter className="gap-2 sticky bottom-0 bg-background pt-3 pb-1">
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
            <Button type="submit" size="sm" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? '저장 중...' : isEditing ? '수정' : '추가'}
            </Button>
          </DialogFooter>
        </form>

        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isRecurringInstance ? '반복 일정 삭제' : '일정을 삭제하시겠습니까?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isRecurringInstance
                  ? `"${event?.title}" 반복 일정을 어떻게 삭제하시겠습니까?`
                  : `"${event?.title}" 일정이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {isRecurringInstance ? (
              <>
                <div className="flex flex-col gap-2 py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExcludeDate}
                    disabled={isPending}
                  >
                    이 일정만 삭제
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteAfterDate}
                    disabled={isPending}
                  >
                    이후 모든 일정 삭제
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteAll}
                    disabled={isPending}
                  >
                    모든 반복 일정 삭제
                  </Button>
                </div>
                <div className="flex justify-end">
                  <AlertDialogCancel>취소</AlertDialogCancel>
                </div>
              </>
            ) : (
              <div className="flex justify-end gap-2 mt-2">
                <AlertDialogCancel>취소</AlertDialogCancel>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAll}
                  disabled={isPending}
                >
                  삭제
                </Button>
              </div>
            )}
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
  );
}
