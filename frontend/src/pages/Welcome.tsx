import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IngestModal } from "@/components/ingest-modal";
import { useState } from "react";
import { useProfile } from "@/hooks/use-profile";

export function Welcome() {
  // TODO: zustland
  const { data: user } = useProfile();
  const [isIngestOpen, setIsIngestOpen] = useState(false);

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center bg-transparent">
        <div className="max-w-3xl space-y-8 mb-12">
          <h1 className="text-2xl font-serif italic text-foreground tracking-tight">
            Good Morning, {user?.display_name ?? "Buddy"}
          </h1>

          <p className="text-1xl text-muted-foreground leading-relaxed font-light italic px-4">
            "You must{" "}
            <span className="text-foreground font-medium underline decoration-primary/30">
              ingest your PDFs
            </span>{" "}
            or text-related files to talk. Upload your file to the engine, wait
            for processing, and chat with your PDF{" "}
            <span className="font-semibold text-primary">
              without being hallucinating
            </span>
            ."
          </p>
        </div>

        <Button
          onClick={() => setIsIngestOpen(true)}
          className="group cursor-pointer relative flex h-12 items-center gap-3 overflow-hidden rounded-xl border border-dashed border-zinc-700 bg-zinc-900 px-8 text-zinc-200 transition-all hover:border-zinc-500 hover:bg-zinc-800 hover:text-white active:scale-95"
        >
          <Plus className="h-4 w-4 text-zinc-400 transition-colors group-hover:text-white" />

          <span className="text-sm font-medium tracking-tight">
            Upload docs
          </span>

          <div className="absolute inset-0 -z-10 bg-linear-to-tr from-zinc-800 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        </Button>
        <IngestModal open={isIngestOpen} setOpen={setIsIngestOpen} />
        <p className="mt-12 text-[10px] text-muted-foreground uppercase tracking-[0.3em] font-bold opacity-50">
          Powered by Quark Inc.
        </p>
      </div>
    </>
  );
}
