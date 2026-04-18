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
      return data.data.id;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ["sessionId"] });
      navigate(`/chat/${sessionId}`);
    },
    onError: () => {
      navigate(`/error`);
    },
  });
}
