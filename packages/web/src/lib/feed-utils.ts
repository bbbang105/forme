/**
 * 큐레이션 UI 유틸리티
 */

const GRADIENTS = [
  'from-sky-100 to-sky-200 dark:from-sky-900/30 dark:to-sky-800/30',
  'from-violet-100 to-violet-200 dark:from-violet-900/30 dark:to-violet-800/30',
  'from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/30',
  'from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30',
  'from-rose-100 to-rose-200 dark:from-rose-900/30 dark:to-rose-800/30',
  'from-indigo-100 to-indigo-200 dark:from-indigo-900/30 dark:to-indigo-800/30',
] as const;

export function getArticleGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]!;
}

export function formatRelativeDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

export const DEFAULT_CATEGORY_STYLES: Record<string, { label: string; bg: string; text: string; ring: string }> = {
  ai: {
    label: 'AI',
    bg: 'bg-violet-100 dark:bg-violet-500/20',
    text: 'text-violet-700 dark:text-violet-300',
    ring: 'ring-violet-200 dark:ring-violet-500/30',
  },
  dev: {
    label: 'DEV',
    bg: 'bg-blue-100 dark:bg-blue-500/20',
    text: 'text-blue-700 dark:text-blue-300',
    ring: 'ring-blue-200 dark:ring-blue-500/30',
  },
  uxui: {
    label: 'UXUI',
    bg: 'bg-sky-100 dark:bg-sky-500/20',
    text: 'text-sky-700 dark:text-sky-300',
    ring: 'ring-sky-200 dark:ring-sky-500/30',
  },
  economy: {
    label: 'ECONOMY',
    bg: 'bg-amber-100 dark:bg-amber-500/20',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-200 dark:ring-amber-500/30',
  },
};

/**
 * Legacy category → canonical mapping.
 * Old categories like 'career', 'frontend', 'backend' map to 'dev'.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  career: 'dev',
  frontend: 'dev',
  backend: 'dev',
  devops: 'dev',
  security: 'dev',
  data: 'dev',
};

export function getCategoryStyle(category: string) {
  const key = CATEGORY_ALIASES[category.toLowerCase()] ?? category.toLowerCase();
  return DEFAULT_CATEGORY_STYLES[key] ?? {
    label: category.toUpperCase(),
    bg: 'bg-gray-100 dark:bg-gray-500/20',
    text: 'text-gray-700 dark:text-gray-300',
    ring: 'ring-gray-200 dark:ring-gray-500/30',
  };
}

export function escapeIlike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}
