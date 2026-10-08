const L1_HIDDEN_NAV_GROUPS = new Set(["Talent Operations"]);

export function isNavGroupVisible(section: string, level: string | null): boolean {
  return level !== "L1" || !L1_HIDDEN_NAV_GROUPS.has(section);
}

