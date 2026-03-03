import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { profiles } from '../schema/profiles';

export type Profile = InferSelectModel<typeof profiles>;
export type NewProfile = InferInsertModel<typeof profiles>;
