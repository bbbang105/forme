'use client';

import {useState, useTransition} from 'react';
import {Plus, Trash2} from 'lucide-react';
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
import {Dialog, DialogContent, DialogHeader, DialogTitle,} from '@/components/ui/dialog';
import {cn} from '@/lib/utils';
import {createCategory, deleteCategory, updateCategory} from '@/lib/actions/categories';
import type {EventCategory} from './types';

const COMMON_EMOJIS = ['📋','👤','🤝','📚','🏠','💼','🎮','🏃','🍽️','✈️','💰','🎵','🔧','❤️','⭐','🎯'];

const CATEGORY_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#f43f5e', '#06b6d4', '#6b7280',
];

interface CategoryManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: EventCategory[];
  onCategoriesChange: (categories: EventCategory[]) => void;
}

export function CategoryManager({
  open,
  onOpenChange,
  categories,
  onCategoriesChange,
}: CategoryManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventCategory | null>(null);

  const handleAddCategory = () => {
    if (categories.length >= 8) return;
    startTransition(async () => {
      try {
        const created = await createCategory({
          name: '새 카테고리',
          color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
          icon: '📌',
        });
        if (created) {
          onCategoriesChange([...categories, created as EventCategory]);
          setEditingId(created.id);
        }
      } catch {
        // ignore
      }
    });
  };

  const handleUpdateName = (id: string, name: string) => {
    onCategoriesChange(categories.map((c) => (c.id === id ? { ...c, name } : c)));
  };

  const handleSaveName = (id: string, name: string) => {
    setEditingId(null);
    startTransition(async () => {
      try {
        await updateCategory(id, { name: name.trim() || '카테고리' });
      } catch {
        // rollback handled by next fetch
      }
    });
  };

  const handleUpdateIcon = (id: string, icon: string) => {
    setShowEmojiPicker(null);
    onCategoriesChange(categories.map((c) => (c.id === id ? { ...c, icon } : c)));
    startTransition(async () => {
      try {
        await updateCategory(id, { icon });
      } catch {
        // rollback handled by next fetch
      }
    });
  };

  const handleUpdateColor = (id: string, color: string) => {
    setShowColorPicker(null);
    onCategoriesChange(categories.map((c) => (c.id === id ? { ...c, color } : c)));
    startTransition(async () => {
      try {
        await updateCategory(id, { color });
      } catch {
        // rollback handled by next fetch
      }
    });
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    onCategoriesChange(categories.filter((c) => c.id !== id));
    startTransition(async () => {
      try {
        await deleteCategory(id);
      } catch {
        // rollback handled by next fetch
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>카테고리 관리</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.id} className="space-y-1.5">
              <div className="flex items-center gap-2 group">
                {/* Emoji 선택 */}
                <button
                  onClick={() => { setShowEmojiPicker(showEmojiPicker === cat.id ? null : cat.id); setShowColorPicker(null); }}
                  className="w-8 h-8 shrink-0 rounded-md border border-border flex items-center justify-center text-sm hover:bg-muted/50 transition-colors"
                >
                  {cat.icon}
                </button>

                {/* 이름 */}
                {editingId === cat.id ? (
                  <Input
                    value={cat.name}
                    onChange={(e) => handleUpdateName(cat.id, e.target.value)}
                    onBlur={() => handleSaveName(cat.id, cat.name)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName(cat.id, cat.name);
                    }}
                    className="h-8 text-sm flex-1"
                    maxLength={50}
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => setEditingId(cat.id)}
                    className="flex-1 text-sm text-left px-2 py-1 rounded hover:bg-muted/50 truncate"
                  >
                    {cat.name}
                  </button>
                )}

                {/* 색상 */}
                <button
                  onClick={() => { setShowColorPicker(showColorPicker === cat.id ? null : cat.id); setShowEmojiPicker(null); }}
                  className="w-5 h-5 rounded-full border-2 border-border shrink-0"
                  style={{ backgroundColor: cat.color }}
                />

                {/* 삭제 */}
                <button
                  onClick={() => setDeleteTarget(cat)}
                  disabled={isPending}
                  className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Emoji picker — 인라인 확장 */}
              {showEmojiPicker === cat.id && (
                <div className="bg-muted/30 border border-border rounded-lg p-2 grid grid-cols-8 gap-1 animate-fade-in">
                  {COMMON_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleUpdateIcon(cat.id, emoji)}
                      className="w-8 h-8 rounded hover:bg-muted flex items-center justify-center text-sm"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* Color picker — 인라인 확장 */}
              {showColorPicker === cat.id && (
                <div className="bg-muted/30 border border-border rounded-lg p-2 flex gap-1.5 justify-center animate-fade-in">
                  {CATEGORY_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => handleUpdateColor(cat.id, color)}
                      className={cn(
                        'w-7 h-7 rounded-full border-2 transition-transform',
                        cat.color === color ? 'border-foreground scale-110' : 'border-transparent'
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 추가 버튼 */}
        {categories.length < 8 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddCategory}
            disabled={isPending}
            className="w-full mt-2"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            카테고리 추가
          </Button>
        )}

        {categories.length >= 8 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            최대 8개까지 생성할 수 있습니다
          </p>
        )}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>카테고리를 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{deleteTarget?.icon} {deleteTarget?.name}&rdquo; 카테고리가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
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
