import {notFound} from 'next/navigation';
import {getMemo} from '@/lib/actions/memos';
import {MemoEditorLazy} from '@/components/features/memo/memo-editor-lazy';

export default async function MemoEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const memo = await getMemo(id);

  if (!memo) notFound();

  return <MemoEditorLazy memo={memo} />;
}
