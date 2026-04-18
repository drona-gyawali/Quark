import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { UploadCloud, File, X, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useIngestionMutation } from "@/hooks/use-ingestion";
import { useNavigate } from "react-router-dom";

export function IngestModal({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);

  const { mutate, isPending } = useIngestionMutation();
  const navigate = useNavigate();
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFile(acceptedFiles[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "text/plain": [".txt"] },
    multiple: false,
  });

  const handleStartIngestion = () => {
    if (!file) return;

    mutate(file, {
      onSuccess: (data) => {
        setFile(null);
        setOpen(false);

        if (data?.ingestionId) {
          navigate(`/process/${data?.ingestionId}`);
        }
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-106.25 border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Ingest Document
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Add a PDF or TXT to Quark's brain.
          </DialogDescription>
        </DialogHeader>

        <div
          {...getRootProps()}
          className={`mt-4 border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
            isDragActive
              ? "border-zinc-400 bg-zinc-900/50"
              : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/30"
          }`}
        >
          <input {...getInputProps()} />
          <UploadCloud
            className={`h-10 w-10 mb-4 transition-colors ${isDragActive ? "text-zinc-100" : "text-zinc-500"}`}
          />
          <p className="text-sm text-zinc-400 text-center">
            {isDragActive ? "Release to upload" : "Drag & drop file or click"}
          </p>
        </div>

        {file && (
          <div className="mt-4 flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-lg animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-800 rounded-md">
                <File className="h-4 w-4 text-zinc-200" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-zinc-200 truncate max-w-[200px]">
                  {file.name}
                </span>
                <span className="text-[10px] text-zinc-500 uppercase">
                  {(file.size / 1024).toFixed(1)} KB
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800"
              onClick={(e) => {
                e.stopPropagation();
                setFile(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Button
          onClick={handleStartIngestion}
          disabled={!file || isPending}
          className="cursor-pointer w-full mt-6 bg-zinc-100 text-zinc-950 hover:bg-zinc-300 disabled:opacity-50 h-11 font-semibold"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            "Start Ingestion"
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
