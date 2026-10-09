const CANDIDATE_SEARCH_COLUMNS = [
  "first_name",
  "last_name",
  "email",
  "primary_technology",
] as const;

function quotePostgrestValue(value: string) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/**
 * Builds one OR group per search term. Chaining the groups in Supabase applies
 * AND semantics between terms, so "Jane Doe" can match first_name and
 * last_name independently while a single-term email or technology search
 * keeps working.
 */
export function buildCandidateSearchOrGroups(search: string) {
  return search
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((term) => {
      const pattern = quotePostgrestValue(`%${term}%`);
      return CANDIDATE_SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(",");
    });
}
