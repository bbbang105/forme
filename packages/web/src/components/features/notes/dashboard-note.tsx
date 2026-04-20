import Link from 'next/link';
import {getRecentMemos} from '@/lib/actions/notes';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {ArrowRight, StickyNote} from 'lucide-react';

export async function DashboardNote() {
  let recentMemos;
  try {
    recentMemos = await getRecentMemos(3);
  } catch {
    return (
      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">노트를 불러올 수 없습니다</p>
        </CardContent>
      </Card>
    );
  }

  if (recentMemos.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <StickyNote className="h-4 w-4 text-primary" />
          최근 노트
        </CardTitle>
        <Link
          href="/note"
          className="text-xs text-primary hover:underline flex items-center gap-0.5"
        >
          전체 보기
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-2">
        {recentMemos.map((note) => (
          <Link
            key={note.id}
            href={`/note/${note.id}`}
            className="block p-2 -mx-2 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <p className="text-sm font-medium truncate">
              {note.title?.trim() || '제목 없음'}
            </p>
            {note.contentText && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {note.contentText.slice(0, 60)}
              </p>
            )}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
