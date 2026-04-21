/**
 * Shared base for items that can be saved / read / bookmarked / noted / pinned
 * across the app (feed articles, YouTube videos). Feature-specific data
 * interfaces extend this with their own domain fields.
 *
 * Keep this narrow — only fields that genuinely mean the same thing in every
 * context belong here. Domain-specific things (url, duration, status, etc.)
 * stay on the extending interface.
 */
export interface SavedItemBase {
  id: string;
  /** Associated source row (channel / RSS source). Nullable for manually-added items. */
  sourceId: string | null;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  /** ISO string (UTC). Null when the upstream feed did not provide a publish date. */
  publishedAt: string | null;
  isRead: boolean;
  isBookmarked: boolean;
  /** Free-form user note attached to the saved item. Null when empty. */
  note: string | null;
  /** ISO string when the item is pinned to the top of the Saved view, otherwise null. */
  pinnedAt: string | null;
}
