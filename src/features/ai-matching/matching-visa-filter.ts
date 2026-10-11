import { VISA_OPTIONS } from "../../lib/candidates-constants.ts";

const VISA_ALIASES: Record<string, string> = {
  "GREEN CARD": "GC",
  "GC EAD": "GC-EAD",
  "GREEN CARD EAD": "GC-EAD",
  "H 1B": "H1B",
  "H4 EAD": "H4-EAD",
  "OPT STEM": "OPT",
  "STEM OPT": "OPT",
  "TN VISA": "TN",
  "US CITIZEN": "USC",
  "US CITIZENSHIP": "USC",
};

export function normalizeVisaStatus(value: string | null | undefined) {
  if (!value?.trim()) return "";
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[-_–—]+/g, " ")
    .replace(/\s+/g, " ");

  if (/\b(?:GC|GREEN CARD)\b.*\bEAD\b/.test(normalized)) return "GC-EAD";
  if (/\bH4\b.*\bEAD\b/.test(normalized)) return "H4-EAD";
  if (/\bH1B(?:T| TRANSFER)?\b/.test(normalized)) return "H1B";
  if (/\b(?:USC|US CITIZEN(?:SHIP)?)\b/.test(normalized)) return "USC";
  if (/\b(?:GC HOLDER|GREEN CARD)\b/.test(normalized) || normalized === "GC") return "GC";
  if (/\bL2\b/.test(normalized)) return "L2";
  if (/\bOPT\b/.test(normalized)) return "OPT";
  if (/\bCPT\b/.test(normalized)) return "CPT";
  if (/\bTN(?: VISA)?\b/.test(normalized)) return "TN";
  if (/\bEAD\b/.test(normalized)) return "EAD";

  return VISA_ALIASES[normalized] ?? normalized;
}

export function buildMatchingVisaOptions(observedValues: Array<string | null>) {
  const options = new Set<string>(VISA_OPTIONS);
  for (const value of observedValues) {
    const normalized = normalizeVisaStatus(value);
    if (normalized) options.add(normalized);
  }
  return [...options];
}

export function matchesSelectedVisas(
  candidateVisa: string | null,
  selectedVisas: readonly string[],
) {
  if (selectedVisas.length === 0) return true;
  const normalizedCandidateVisa = normalizeVisaStatus(candidateVisa);
  return selectedVisas.some(
    (selectedVisa) => normalizeVisaStatus(selectedVisa) === normalizedCandidateVisa,
  );
}
