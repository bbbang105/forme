import {describe, expect, it} from 'vitest';

import {
  DATE_REGEX,
  HEX_COLOR_REGEX,
  TIME_REGEX,
  UUID_REGEX,
  YOUTUBE_CHANNEL_ID_REGEX,
  YOUTUBE_VIDEO_ID_REGEX,
} from '@/lib/validators';

/**
 * Boundary-value regression guards for the shared regex constants.
 * Every Server Action / API route trusts these — a regression here affects
 * the entire codebase, so keep the coverage tight.
 */

describe('DATE_REGEX — YYYY-MM-DD', () => {
  it('accepts well-formed ISO dates', () => {
    expect(DATE_REGEX.test('2026-04-21')).toBe(true);
    expect(DATE_REGEX.test('1999-01-01')).toBe(true);
  });

  it('rejects wrong separators / widths / free text', () => {
    expect(DATE_REGEX.test('2026/04/21')).toBe(false);
    expect(DATE_REGEX.test('26-04-21')).toBe(false);
    expect(DATE_REGEX.test('2026-4-21')).toBe(false);
    expect(DATE_REGEX.test('not-a-date')).toBe(false);
    expect(DATE_REGEX.test('')).toBe(false);
  });
});

describe('HEX_COLOR_REGEX — #RRGGBB', () => {
  it('accepts 6-hex colors (case insensitive)', () => {
    expect(HEX_COLOR_REGEX.test('#3b82f6')).toBe(true);
    expect(HEX_COLOR_REGEX.test('#FFFFFF')).toBe(true);
    expect(HEX_COLOR_REGEX.test('#000000')).toBe(true);
  });

  it('rejects short, alpha, or non-hex variants', () => {
    expect(HEX_COLOR_REGEX.test('#fff')).toBe(false);
    expect(HEX_COLOR_REGEX.test('3b82f6')).toBe(false);
    expect(HEX_COLOR_REGEX.test('#3b82f6aa')).toBe(false);
    expect(HEX_COLOR_REGEX.test('#gggggg')).toBe(false);
  });
});

describe('UUID_REGEX', () => {
  it('accepts canonical UUID v4 and mixed case', () => {
    expect(UUID_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(UUID_REGEX.test('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rejects malformed UUIDs', () => {
    expect(UUID_REGEX.test('not-a-uuid')).toBe(false);
    expect(UUID_REGEX.test('550e8400-e29b-41d4-a716')).toBe(false);
    expect(UUID_REGEX.test('550e8400e29b41d4a716446655440000')).toBe(false);
    expect(UUID_REGEX.test('')).toBe(false);
  });
});

describe('TIME_REGEX — HH:MM (24h)', () => {
  it('accepts full day range', () => {
    expect(TIME_REGEX.test('00:00')).toBe(true);
    expect(TIME_REGEX.test('09:30')).toBe(true);
    expect(TIME_REGEX.test('23:59')).toBe(true);
  });

  it('rejects out-of-range / malformed times', () => {
    expect(TIME_REGEX.test('24:00')).toBe(false);
    expect(TIME_REGEX.test('12:60')).toBe(false);
    expect(TIME_REGEX.test('9:30')).toBe(false);
    expect(TIME_REGEX.test('09:30:00')).toBe(false);
  });
});

describe('YOUTUBE_VIDEO_ID_REGEX — 11-char id', () => {
  it('accepts real-world videoIds (including `_` and `-`)', () => {
    expect(YOUTUBE_VIDEO_ID_REGEX.test('dQw4w9WgXcQ')).toBe(true);
    expect(YOUTUBE_VIDEO_ID_REGEX.test('abc_def-123')).toBe(true);
    expect(YOUTUBE_VIDEO_ID_REGEX.test('_-_-_-_-_-_')).toBe(true);
  });

  it('rejects wrong length or bad chars (injection attempts)', () => {
    expect(YOUTUBE_VIDEO_ID_REGEX.test('short')).toBe(false);
    expect(YOUTUBE_VIDEO_ID_REGEX.test('dQw4w9WgXcQ1')).toBe(false); // 12
    expect(YOUTUBE_VIDEO_ID_REGEX.test('dQw4w9WgXc')).toBe(false); // 10
    expect(YOUTUBE_VIDEO_ID_REGEX.test('abc"injected')).toBe(false);
    expect(YOUTUBE_VIDEO_ID_REGEX.test('abc defghij')).toBe(false);
    expect(YOUTUBE_VIDEO_ID_REGEX.test('abc/defghij')).toBe(false);
    expect(YOUTUBE_VIDEO_ID_REGEX.test('')).toBe(false);
  });
});

describe('YOUTUBE_CHANNEL_ID_REGEX — UC + 22 chars', () => {
  it('accepts well-formed channel ids', () => {
    expect(YOUTUBE_CHANNEL_ID_REGEX.test('UC_x5XG1OV2P6uZZ5FSM9Ttw')).toBe(true);
    expect(YOUTUBE_CHANNEL_ID_REGEX.test('UCaaaaaaaaaaaaaaaaaaaaaa')).toBe(true);
  });

  it('rejects wrong prefix or length', () => {
    expect(YOUTUBE_CHANNEL_ID_REGEX.test('uc_x5XG1OV2P6uZZ5FSM9Ttw')).toBe(false);
    expect(YOUTUBE_CHANNEL_ID_REGEX.test('UC_x5XG1OV2P6uZZ5FSM9Tt')).toBe(false);
    expect(YOUTUBE_CHANNEL_ID_REGEX.test('XC_x5XG1OV2P6uZZ5FSM9Ttw')).toBe(false);
    expect(YOUTUBE_CHANNEL_ID_REGEX.test('')).toBe(false);
  });
});
