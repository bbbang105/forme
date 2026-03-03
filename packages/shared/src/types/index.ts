import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { profiles } from '../schema/profiles';
import type { curationSources } from '../schema/curation-sources';
import type { curationItems } from '../schema/curation-items';

export type Profile = InferSelectModel<typeof profiles>;
export type NewProfile = InferInsertModel<typeof profiles>;

export type CurationSource = InferSelectModel<typeof curationSources>;
export type NewCurationSource = InferInsertModel<typeof curationSources>;

export type CurationItem = InferSelectModel<typeof curationItems>;
export type NewCurationItem = InferInsertModel<typeof curationItems>;
