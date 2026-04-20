import {Skeleton} from '@/components/ui/skeleton';

export default function NoteEditorLoading() {
  return (
    <div className="flex flex-col h-[calc(100vh-env(safe-area-inset-top)-env(safe-area-inset-bottom))]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 z-10 bg-background">
        {/* Back button area */}
        <Skeleton className="h-7 w-16 rounded-md" />

        {/* Action buttons: pin + delete */}
        <div className="flex items-center gap-1">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border overflow-x-hidden">
        {/* Bold / Italic / Underline / Strike */}
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-8 rounded-md shrink-0" />
        ))}
        {/* Divider */}
        <Skeleton className="h-5 w-px mx-0.5 shrink-0" />
        {/* H1 / H2 / H3 */}
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i + 4} className="h-8 w-8 rounded-md shrink-0" />
        ))}
        {/* Divider */}
        <Skeleton className="h-5 w-px mx-0.5 shrink-0" />
        {/* List / OL / Checklist */}
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i + 7} className="h-8 w-8 rounded-md shrink-0" />
        ))}
        {/* Divider */}
        <Skeleton className="h-5 w-px mx-0.5 shrink-0" />
        {/* Quote / Link / Undo / Redo */}
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i + 10} className="h-8 w-8 rounded-md shrink-0" />
        ))}
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Title input */}
        <Skeleton className="h-9 w-3/5 rounded" />

        {/* Content lines */}
        <div className="space-y-3 pt-1">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-11/12 rounded" />
          <Skeleton className="h-4 w-4/5 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-2/3 rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-3/4 rounded" />
        </div>
      </div>
    </div>
  );
}
