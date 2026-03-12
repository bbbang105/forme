// 공유 검증 정규식
export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
export const YOUTUBE_CHANNEL_ID_REGEX = /^UC[a-zA-Z0-9_-]{22}$/;
export const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
