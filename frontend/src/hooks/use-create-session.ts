import { useMutation } from "@tanstack/react-query";
import { createSession } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

export function useCreateSession() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => {
      const data = await createSession({ label });
      if(!data?.data?.id) {
        throw new Error("Session creation did not return an id");
      }
      return data.data.id;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["sessionId"] });
      navigate(`/c/${sessionId}`);
    },
    onError: () => {
      navigate(`/something-went-wrong`);
    },
  });
}
