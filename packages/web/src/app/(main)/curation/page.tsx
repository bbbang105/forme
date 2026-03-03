import { Suspense } from 'react';
import { CurationFeed } from '@/components/features/curation/curation-feed';

export default function CurationPage() {
  return (
    <Suspense>
      <CurationFeed />
    </Suspense>
  );
}
