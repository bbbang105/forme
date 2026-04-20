/**
 * 피드 UI 유틸리티
 */

const GRADIENTS = [
  'from-amber-100 to-amber-200 dark:from-amber-900/30 dark:to-amber-800/30',
  'from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/30',
  'from-rose-100 to-rose-200 dark:from-rose-900/30 dark:to-rose-800/30',
  'from-stone-100 to-stone-200 dark:from-stone-900/30 dark:to-stone-800/30',
  'from-emerald-100 to-emerald-200 dark:from-emerald-900/30 dark:to-emerald-800/30',
  'from-slate-100 to-slate-200 dark:from-slate-900/30 dark:to-slate-800/30',
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
    bg: 'bg-rose-100 dark:bg-rose-500/20',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-200 dark:ring-rose-500/30',
  },
  dev: {
    label: 'DEV',
    bg: 'bg-stone-100 dark:bg-stone-500/20',
    text: 'text-stone-700 dark:text-stone-300',
    ring: 'ring-stone-200 dark:ring-stone-500/30',
  },
  uxui: {
    label: 'UXUI',
    bg: 'bg-emerald-100 dark:bg-emerald-500/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-200 dark:ring-emerald-500/30',
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
