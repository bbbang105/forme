import {notFound} from 'next/navigation';
import {getNote} from '@/lib/actions/notes';
import {NoteEditorLazy} from '@/components/features/notes/note-editor-lazy';

export default async function NoteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const note = await getNote(id);

  if (!note) notFound();

  return <NoteEditorLazy note={note} />;
}
