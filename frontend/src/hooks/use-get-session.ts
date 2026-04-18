import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/lib/api";

export function useSessionGet() {
  return useQuery({
    queryKey: ["sessionId"],
    queryFn: async () => {
      const res = await getSession();
      return res;
    },
  });
}
