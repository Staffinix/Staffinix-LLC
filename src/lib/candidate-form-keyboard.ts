export interface EnterKeyControl {
  tagName: string;
  type?: string | null;
  role?: string | null;
  ariaExpanded?: string | null;
  ariaAutocomplete?: string | null;
  isComposing?: boolean;
  hasModifier?: boolean;
}

export function shouldAdvanceCandidateFormOnEnter(control: EnterKeyControl): boolean {
  if (control.isComposing || control.hasModifier) return false;

  const tagName = control.tagName.toLowerCase();
  const type = control.type?.toLowerCase() ?? "";
  const role = control.role?.toLowerCase() ?? "";

  if (tagName === "textarea" || type === "file" || type === "submit") return false;
  if (control.ariaAutocomplete) return false;
  if (role === "combobox" && control.ariaExpanded === "true") return false;

  return (
    tagName === "input" ||
    tagName === "select" ||
    role === "combobox" ||
    role === "checkbox" ||
    role === "radio" ||
    role === "switch"
  );
}
