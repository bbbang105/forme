import {cache} from 'react';
import {createClient} from '@/lib/supabase/server';

/**
 * React.cache-memoized auth check.
 *
 * Within a single React server render pass every call resolves to the same
 * Promise, so `supabase.auth.getUser()` is only invoked once per request no
 * matter how many Server Actions or Server Components call this helper.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Unauthorized');
  return user;
});
