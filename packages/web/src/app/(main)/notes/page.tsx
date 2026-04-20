import {getNotesPage} from '@/lib/actions/notes';
import {NoteList} from '@/components/features/notes/note-list';

export default async function NotesPage() {
  const {notes, hasMore, nextOffset} = await getNotesPage();

  return <NoteList initialMemos={notes} initialHasMore={hasMore} initialNextOffset={nextOffset} />;
}
