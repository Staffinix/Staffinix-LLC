import { Search, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type RecruiterOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export function RecruiterPicker({
  recruiters,
  value,
  onChange,
}: {
  recruiters: RecruiterOption[];
  value: string;
  onChange: (recruiterId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filteredRecruiters = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return recruiters;
    return recruiters.filter((recruiter) =>
      `${recruiter.full_name ?? ""} ${recruiter.email ?? ""}`.toLowerCase().includes(query),
    );
  }, [recruiters, search]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search recruiter name or email"
          aria-label="Search eligible L4 recruiters"
          className="pl-9"
        />
      </div>
      <div
        role="listbox"
        aria-label="Eligible L4 recruiters"
        className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-1"
      >
        {filteredRecruiters.map((recruiter) => {
          const selected = recruiter.id === value;
          return (
            <button
              key={recruiter.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChange(recruiter.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs transition-colors",
                selected ? "bg-primary/15 text-primary" : "hover:bg-muted",
              )}
            >
              <UserRound className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">
                  {recruiter.full_name || "Unnamed recruiter"}
                </span>
                <span className="block truncate text-muted-foreground">{recruiter.email}</span>
              </span>
            </button>
          );
        })}
        {filteredRecruiters.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            No matching active L4 recruiter.
          </p>
        )}
      </div>
    </div>
  );
}
