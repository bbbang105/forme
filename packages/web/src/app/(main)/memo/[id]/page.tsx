import {notFound} from 'next/navigation';
import {getMemo} from '@/lib/actions/memos';
import {MemoEditor} from '@/components/features/memo/memo-editor';

export default async function MemoEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const memo = await getMemo(id);

  if (!memo) notFound();

  return <MemoEditor memo={memo} />;
}
