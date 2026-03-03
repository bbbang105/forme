import {getMemos} from '@/lib/actions/memos';
import {MemoList} from '@/components/features/memo/memo-list';

export default async function MemoPage() {
  const memos = await getMemos();

  return <MemoList memos={memos} />;
}
