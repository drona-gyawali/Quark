import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { chatSignal, type ChatSignal } from "@/lib/api";

export const useChat = (sessionId: string) => {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  const mutation = useMutation({
    mutationFn: async (message: string) => {
      const controller = new AbortController();
      abortRef.current = controller;

      queryClient.setQueryData(["chat", sessionId], (old: any[] = []) => [
        ...old,
        { role: "user", content: message },
        { role: "assistant", content: "" },
      ]);
      const data: ChatSignal = {
        message: message,
        sessionId: sessionId,
      };
      await chatSignal(data, controller, (chunk: any) => {
        queryClient.setQueryData(["chat", sessionId], (old: any[] = []) => {
          const updated = [...old];
          const lastIndex = updated.length - 1;

          updated[lastIndex] = {
            ...updated[lastIndex],
            content: updated[lastIndex].content + chunk,
          };

          return updated;
        });
      });
    },

    onSettled: () => {
      abortRef.current = null;
    },
  });

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    mutation.reset();
  };

  return {
    send: mutation.mutate,
    isLoading: mutation.isPending,
    stop,
  };
};
