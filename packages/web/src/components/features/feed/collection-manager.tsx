'use client';

import {useCallback, useState, useTransition} from 'react';
import {GripVertical, Plus, Trash2} from 'lucide-react';
import {
    closestCenter,
    DndContext,
    type DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {SortableContext, useSortable, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import {restrictToVerticalAxis} from '@dnd-kit/modifiers';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
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
import {Dialog, DialogContent, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {cn} from '@/lib/utils';
import {createCollection, deleteCollection, reorderCollections, updateCollection} from '@/lib/actions/collections';

export interface BookmarkCollection {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  count?: number;
}

const COLLECTION_COLORS = [
  '#D96B3B', '#a855f7', '#22c55e', '#f59e0b',
  '#ef4444', '#ec4899', '#6366f1', '#14b8a6',
];

interface CollectionManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collections: BookmarkCollection[];
  onCollectionsChange: (collections: BookmarkCollection[]) => void;
}

// ─── Sortable item ────────────────────────────────────────────────────────────

function SortableCollectionItem({
  col,
  editingId,
  showColorPicker,
  isPending,
  onEditStart,
  onUpdateName,
  onSaveName,
  onToggleColorPicker,
  onUpdateColor,
  onDelete,
}: {
  col: BookmarkCollection;
  editingId: string | null;
  showColorPicker: string | null;
  isPending: boolean;
  onEditStart: (id: string) => void;
  onUpdateName: (id: string, name: string) => void;
  onSaveName: (id: string, name: string) => void;
  onToggleColorPicker: (id: string) => void;
  onUpdateColor: (id: string, color: string) => void;
  onDelete: (col: BookmarkCollection) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: col.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('space-y-1.5', isDragging && 'opacity-50')}
    >
      <div className="flex items-center gap-2 group">
        {/* Drag handle */}
        <button
          className="shrink-0 p-1 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label="순서 변경"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* 색상 dot */}
        <button
          onClick={() => onToggleColorPicker(col.id)}
          className="w-4 h-4 rounded-full shrink-0 border-2 border-border"
          style={{ backgroundColor: col.color }}
          aria-label="색상 변경"
        />

        {/* 이름 */}
        {editingId === col.id ? (
          <Input
            value={col.name}
            onChange={(e) => onUpdateName(col.id, e.target.value)}
            onBlur={() => onSaveName(col.id, col.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveName(col.id, col.name);
            }}
            className="h-8 text-sm flex-1"
            maxLength={50}
            autoFocus
          />
        ) : (
          <button
            onClick={() => onEditStart(col.id)}
            className="flex-1 text-sm text-left px-2 py-1 rounded hover:bg-muted/50 truncate"
          >
            {col.name}
          </button>
        )}

        {/* 개수 */}
        {col.count !== undefined && (
          <span className="text-xs text-muted-foreground shrink-0">{col.count}개</span>
        )}

        {/* 삭제 */}
        <button
          onClick={() => onDelete(col)}
          disabled={isPending}
          className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
          aria-label={`${col.name} 삭제`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Color picker */}
      {showColorPicker === col.id && (
        <div className="bg-muted/30 border border-border rounded-lg p-2 flex gap-1.5 justify-center animate-fade-in ml-7">
          {COLLECTION_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => onUpdateColor(col.id, color)}
              className={cn(
                'w-7 h-7 rounded-full border-2 transition-transform',
                col.color === color ? 'border-foreground scale-110' : 'border-transparent'
              )}
              style={{ backgroundColor: color }}
              aria-label={color}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Manager dialog ───────────────────────────────────────────────────────────

export function CollectionManager({
  open,
  onOpenChange,
  collections,
  onCollectionsChange,
}: CollectionManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BookmarkCollection | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = collections.findIndex((c) => c.id === active.id);
    const newIndex = collections.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...collections];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Update sortOrder
    const updated = reordered.map((c, i) => ({ ...c, sortOrder: i }));
    onCollectionsChange(updated);

    startTransition(async () => {
      try {
        await reorderCollections(updated.map((c) => c.id));
      } catch {
        // rollback on next fetch
      }
    });
  }, [collections, onCollectionsChange, startTransition]);

  const handleAdd = () => {
    if (collections.length >= 10) return;
    startTransition(async () => {
      try {
        const created = await createCollection({
          name: '새 컬렉션',
          color: COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length]!,
        });
        if (created) {
          onCollectionsChange([...collections, { ...created, count: 0 }]);
          setEditingId(created.id);
        }
      } catch {
        // ignore
      }
    });
  };

  const handleUpdateName = (id: string, name: string) => {
    onCollectionsChange(collections.map((c) => (c.id === id ? { ...c, name } : c)));
  };

  const handleSaveName = (id: string, name: string) => {
    setEditingId(null);
    startTransition(async () => {
      try {
        await updateCollection(id, { name: name.trim() || '컬렉션' });
      } catch {
        // rollback on next fetch
      }
    });
  };

  const handleUpdateColor = (id: string, color: string) => {
    setShowColorPicker(null);
    onCollectionsChange(collections.map((c) => (c.id === id ? { ...c, color } : c)));
    startTransition(async () => {
      try {
        await updateCollection(id, { color });
      } catch {
        // rollback on next fetch
      }
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    onCollectionsChange(collections.filter((c) => c.id !== id));
    startTransition(async () => {
      try {
        await deleteCollection(id);
      } catch {
        // rollback on next fetch
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>컬렉션 관리</DialogTitle>
        </DialogHeader>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={collections.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {collections.map((col) => (
                <SortableCollectionItem
                  key={col.id}
                  col={col}
                  editingId={editingId}
                  showColorPicker={showColorPicker}
                  isPending={isPending}
                  onEditStart={setEditingId}
                  onUpdateName={handleUpdateName}
                  onSaveName={handleSaveName}
                  onToggleColorPicker={(id) => setShowColorPicker(showColorPicker === id ? null : id)}
                  onUpdateColor={handleUpdateColor}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {collections.length < 10 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={isPending}
            className="w-full mt-2"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            컬렉션 추가
          </Button>
        )}

        {collections.length >= 10 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            최대 10개까지 생성할 수 있습니다
          </p>
        )}

        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>컬렉션을 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{deleteTarget?.name}&rdquo; 컬렉션이 삭제됩니다. 포함된 북마크는 미분류로 돌아갑니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
