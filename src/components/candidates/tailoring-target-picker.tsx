import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getCandidate, listCandidates } from "@/lib/candidates.functions";
import { listRequirements } from "@/lib/requirements.functions";
import {
  domainsForTechnology,
  requirementTargetFit,
  TECHNOLOGY_NAMES,
} from "@/lib/tailoring-targets";
import { cn } from "@/lib/utils";

export type TailoringSelection = {
  candidateId: string;
  technology: string;
  domain: string;
  reqId?: string;
};

export function TailoringTargetPicker({
  initial,
  onStart,
}: {
  initial: Partial<TailoringSelection>;
  onStart: (selection: TailoringSelection) => void;
}) {
  const [candidateId, setCandidateId] = useState(initial.candidateId ?? "");
  const [technology, setTechnology] = useState(initial.technology ?? "");
  const [domain, setDomain] = useState(initial.domain ?? "");
  const [reqId, setReqId] = useState(initial.reqId ?? "");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const listCandidatesFn = useServerFn(listCandidates);
  const getCandidateFn = useServerFn(getCandidate);
  const listRequirementsFn = useServerFn(listRequirements);

  const candidatesQuery = useQuery({
    queryKey: ["candidates", "tailoring-picker", debouncedSearch],
    queryFn: () =>
      listCandidatesFn({ data: { search: debouncedSearch || undefined, page: 1, page_size: 50 } }),
    placeholderData: (previous) => previous,
  });
  const selectedInList = candidatesQuery.data?.rows.find((row) => row.id === candidateId);
  const selectedCandidateQuery = useQuery({
    queryKey: ["candidate", candidateId, "profile"],
    queryFn: () => getCandidateFn({ data: { id: candidateId, view: "profile" } }),
    enabled: Boolean(candidateId) && !selectedInList,
  });
  const selectedCandidate = selectedInList ?? selectedCandidateQuery.data;

  const requirementsQuery = useQuery({
    queryKey: ["requirements", "tailoring-picker"],
    queryFn: () => listRequirementsFn({ data: { status: ["open"], page: 1, page_size: 100 } }),
    enabled: Boolean(technology && domain),
  });
  // shortcut: checks the 100 newest open requirements, add server filtering if more are open.
  const matches = useMemo(
    () =>
      (requirementsQuery.data?.rows ?? [])
        .map((row) => ({ row, fit: requirementTargetFit(row, technology, domain) }))
        .filter((item) => item.fit > 0)
        .sort((a, b) => b.fit - a.fit),
    [requirementsQuery.data, technology, domain],
  );

  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label id="tailoring-candidate-label">Candidate</Label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  aria-labelledby="tailoring-candidate-label tailoring-candidate-value"
                  className="w-full justify-between font-normal"
                >
                  <span id="tailoring-candidate-value" className="truncate">
                    {selectedCandidate
                      ? `${selectedCandidate.first_name} ${selectedCandidate.last_name}`
                      : "Select candidate"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search name, email, skills…"
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList>
                    <CommandEmpty>
                      {candidatesQuery.isLoading ? "Loading…" : "No candidates found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {candidatesQuery.data?.rows.map((row) => (
                        <CommandItem
                          key={row.id}
                          value={row.id}
                          onSelect={() => {
                            setCandidateId(row.id);
                            setOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              row.id === candidateId ? "opacity-100" : "opacity-0",
                            )}
                            aria-hidden="true"
                          />
                          <span className="truncate">
                            {row.first_name} {row.last_name}
                            {row.current_title ? ` · ${row.current_title}` : ""}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tailoring-technology">Technology</Label>
            <Select
              value={technology}
              onValueChange={(value) => {
                setTechnology(value);
                setDomain("");
                setReqId("");
              }}
            >
              <SelectTrigger id="tailoring-technology">
                <SelectValue placeholder="Select technology" />
              </SelectTrigger>
              <SelectContent>
                {TECHNOLOGY_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tailoring-domain">Domain</Label>
            <Select
              value={domain}
              disabled={!technology}
              onValueChange={(value) => {
                setDomain(value);
                setReqId("");
              }}
            >
              <SelectTrigger id="tailoring-domain">
                <SelectValue
                  placeholder={technology ? "Select domain" : "Select technology first"}
                />
              </SelectTrigger>
              <SelectContent>
                {domainsForTechnology(technology).map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {technology && domain && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Matching requirements (optional)</legend>
            <label className="flex items-center gap-2 rounded-md border border-border p-2.5 text-sm">
              <input
                type="radio"
                name="tailoring-requirement"
                checked={!reqId}
                onChange={() => setReqId("")}
              />
              No requirement: tailor for {domain} ({technology})
            </label>
            {requirementsQuery.isLoading && (
              <p className="text-xs text-muted-foreground">Loading requirements…</p>
            )}
            {requirementsQuery.isError && (
              <p role="alert" className="text-xs text-destructive">
                Requirements could not be loaded. You can still tailor without one.
              </p>
            )}
            {requirementsQuery.isSuccess && matches.length === 0 && (
              <p className="text-xs text-muted-foreground">No open requirements match.</p>
            )}
            <div className="max-h-52 space-y-2 overflow-y-auto">
              {matches.map(({ row, fit }) => (
                <label
                  key={row.id}
                  className="flex items-center gap-2 rounded-md border border-border p-2.5 text-sm"
                >
                  <input
                    type="radio"
                    name="tailoring-requirement"
                    checked={reqId === row.id}
                    onChange={() => setReqId(row.id)}
                  />
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fit === 2 ? "Technology + domain" : "Technology"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Uses only facts already in the candidate's verified resume.
          </p>
          <Button
            disabled={!candidateId || !technology || !domain}
            onClick={() => onStart({ candidateId, technology, domain, reqId: reqId || undefined })}
          >
            <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" /> Tailor resume
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
