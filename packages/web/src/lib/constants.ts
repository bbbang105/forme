/**
 * Application-wide constants shared across features.
 *
 * Other worktrees (curation, calendar/memo, podcast) will extend this file
 * with their own feature-specific constants. Centralising them here avoids
 * magic numbers scattered across the codebase and makes global tuning easy.
 */

// ── Pagination ──────────────────────────────────────────────────────────────
/** Default number of items per page for list views. */
export const DEFAULT_PAGE_SIZE = 20;

// ── Curation ─────────────────────────────────────────────────────────────────
/** Maximum number of curation items allowed in a bulk-delete operation. */
export const CURATION_BULK_DELETE_MAX = 100;
/** Maximum length for a curation item memo/note field. */
export const CURATION_MEMO_MAX_LENGTH = 500;

// ── Memo ─────────────────────────────────────────────────────────────────────
/** Maximum number of tags per memo. */
export const MEMO_MAX_TAGS = 5;
/** Maximum length per tag string. */
export const MEMO_TAG_MAX_LENGTH = 30;
/** Maximum size (bytes) for memo image uploads. 5 MB. */
export const MEMO_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// ── Profile ──────────────────────────────────────────────────────────────────
/** Maximum length for a user display name. */
export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 255;
/** Maximum number of interest tags on a user profile. */
export const PROFILE_INTERESTS_MAX = 6;

// ── Service Worker ───────────────────────────────────────────────────────────
/** Maximum number of SW registration retry attempts. */
export const SW_MAX_REGISTRATION_RETRIES = 3;
/** Base delay (ms) between SW registration retries (exponential backoff). */
export const SW_RETRY_BASE_DELAY_MS = 1000;

// ── Video Summary ───────────────────────────────────────────────────────────
/** Maximum number of videos that can be summarized in a single batch. */
export const VIDEO_SUMMARIZE_BATCH_MAX = 5;
/** Number of items per page in the video feed. */
export const VIDEO_FEED_PAGE_SIZE = 20;
/** Timeout (ms) after which a "summarizing" item is reset to "collected". */
export const VIDEO_SUMMARIZING_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
