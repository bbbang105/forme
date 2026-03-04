import {getMemosPage} from '@/lib/actions/memos';
import {MemoList} from '@/components/features/memo/memo-list';

export default async function MemoPage() {
  const {memos, hasMore, nextOffset} = await getMemosPage();

  return <MemoList initialMemos={memos} initialHasMore={hasMore} initialNextOffset={nextOffset} />;
}
