import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTenancy } from "@/lib/tenancy.functions";

export function useTenancy() {
  const getTenancyFn = useServerFn(getTenancy);

  return useQuery({
    queryKey: ["tenancy"],
    queryFn: () => getTenancyFn(),
    staleTime: 60_000,
  });
}
