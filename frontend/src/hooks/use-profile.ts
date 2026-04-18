import { useQuery } from "@tanstack/react-query";
import { profile } from "@/lib/api";

export const useProfile = () => {
  return useQuery({
    queryKey: ["user-details"],
    queryFn: profile,
  });
};
