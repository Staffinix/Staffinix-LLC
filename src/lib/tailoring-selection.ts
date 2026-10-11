export type FactSelection = {
  skill_ids: string[];
  employment_ids: string[];
  education_ids: string[];
  project_ids: string[];
  certification_ids: string[];
};

export function validateFactSelection(
  source: {
    skills: { id: string }[];
    employment: { id: string }[];
    education: { id: string }[];
    projects: { id: string }[];
    certifications: { id: string }[];
  },
  selection: FactSelection,
) {
  const categories = [
    ["skill_ids", source.skills],
    ["employment_ids", source.employment],
    ["education_ids", source.education],
    ["project_ids", source.projects],
    ["certification_ids", source.certifications],
  ] as const;
  const selectedIds: string[] = [];
  for (const [key, rows] of categories) {
    const allowed = new Set(rows.map((row) => row.id));
    const ids = selection[key];
    if (new Set(ids).size !== ids.length || ids.some((id) => !allowed.has(id))) {
      throw new Error(`Unsupported or duplicated ${key}; no draft was saved`);
    }
    selectedIds.push(...ids);
  }
  return {
    valid: true,
    validation_mode: "existing_record_ids_only",
    generated_claims_allowed: false,
    claim_count: selectedIds.length,
    selected_ids: selectedIds,
    checked_at: new Date().toISOString(),
  };
}
