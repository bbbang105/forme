'use client';

import {useEffect, useRef, useState} from 'react';
import {Search, X} from 'lucide-react';
import {cn} from '@/lib/utils';

interface FeedSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function FeedSearch({ value, onChange }: FeedSearchProps) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const handleChange = (v: string) => {
    setLocal(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 300);
  };

  const handleClear = () => {
    setLocal('');
    onChange('');
  };

  return (
    <div className="relative">
      <Search
        className="absolute left-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Search articles…"
        aria-label="피드 검색"
        className={cn(
          'w-full h-10 pl-6 pr-7 bg-transparent',
          'border-b border-border',
          'text-base placeholder:text-muted-foreground',
          'focus:outline-none focus:border-primary',
          'transition-colors',
        )}
      />
      {local && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-0 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-primary transition-colors"
          aria-label="검색어 지우기"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
