import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signedUrl, s3Upload, createSession, processFile } from "@/lib/api";
import { toast } from "sonner";

export function useIngestionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const data = await signedUrl({
        filename: file.name,
        contentSize: file.size,
        contentType: file.type,
      });

      const signedUrl_ = data?.uploadData?.signedUrl;
      const key = data?.uploadData?.key;

      if (!signedUrl_) throw new Error("Failed to generate upload path");

      const uploadSuccess = await s3Upload(signedUrl_, file);
      if (!uploadSuccess) throw new Error("S3 Upload failed");

      const sessionCreated = await createSession({
        label: `Ask ${file.name} for your doubt`,
      });

      if (!sessionCreated?.data) throw new Error("Session creation failed");

      const startEngine = await processFile({
        filename: file.name,
        session_id: sessionCreated.data.id,
        key: key,
      });

      if (!startEngine) throw new Error("Ingestion trigger failed");

      return {
        status: startEngine?.data?.status,
        ingestionId: startEngine?.data?.ingestId,
        sessionId: sessionCreated?.data?.id,
      };
    },
    onSuccess: () => {
      toast.success("Ingestion started successfully!");
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Something went wrong during ingestion");
    },
  });
}
