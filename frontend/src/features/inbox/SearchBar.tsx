import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchBarProps {
  /** The query currently applied (from the URL). */
  query: string;
  onSearch: (q: string) => void;
}

export function SearchBar({ query, onSearch }: SearchBarProps) {
  const [value, setValue] = useState(query);
  const debounced = useDebounce(value.trim(), 300);

  useEffect(() => {
    if (debounced !== query) onSearch(debounced);
  }, [debounced, query, onSearch]);

  return (
    <label className="relative block min-w-0 flex-1">
      <Search aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search"
        aria-label="Search emails"
        className="h-9 w-full rounded-full bg-field pl-10 pr-4 text-xs placeholder:text-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />
    </label>
  );
}
