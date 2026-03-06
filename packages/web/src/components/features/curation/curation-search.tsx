'use client';

import {useEffect, useRef, useState} from 'react';
import {Search, X} from 'lucide-react';
import {cn} from '@/lib/utils';

interface CurationSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function CurationSearch({ value, onChange }: CurationSearchProps) {
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
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="제목이나 내용으로 검색..."
        className={cn(
          'w-full h-10 pl-9 pr-9 rounded-lg border border-border bg-background',
          'text-base placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
          'transition-colors'
        )}
      />
      {local && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
          aria-label="검색어 지우기"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
