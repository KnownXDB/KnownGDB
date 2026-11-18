import { memo, useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";

export const SearchBox = memo(function SearchBox({
  onSearch,
}: {
  onSearch: (query: string) => void;
}) {
  const [draft, setDraft] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => onSearch(draft.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [draft, onSearch]);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(draft.trim());
  }
  return (
    <form className="catalog-search" onSubmit={submit} role="search">
      <label className="catalog-search-input">
        <Search size={22} aria-hidden="true" />
        <span className="sr-only">Search games</span>
        <input
          aria-label="Search games"
          maxLength={120}
          placeholder="Search games"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
    </form>
  );
});
