import { useQuery } from "@tanstack/react-query";
import { getIngestLog } from "@/lib/api";

export function useIngestionStatus(ingestionId: string) {
  return useQuery({
    queryKey: ["ingestionPool", ingestionId],
    queryFn: async () => {
      const res = await getIngestLog(ingestionId);
      return res.data[0];
    },

    enabled: !!ingestionId,

    refetchInterval: (query) => {
      const status = query.state.data?.status;

      if (status == "completed" || status == "failed") {
        return false;
      }

      return 2000;
    },
    refetchIntervalInBackground: true,
  });
}
