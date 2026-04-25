import { useIngestionStatus } from "@/hooks/use-ingestion-status";
import {
  CheckCircle2,
  XCircle,
  FileText,
  ExternalLink,
  ChevronRight,
  Info,
} from "lucide-react";
import { Link, useParams, Navigate } from "react-router-dom";

export function Processing() {
  const { ingestionId } = useParams<{ ingestionId: string }>();

  if (!ingestionId) {
    return <Navigate to="/something-went-wrong" replace />;
  }

  const { data } = useIngestionStatus(ingestionId);
  const status = data?.status || "pending";

  return (
    <div className="min-h-screen bg-black text-zinc-400 selection:bg-white selection:text-black flex flex-col">
      <main className="flex-1 max-w-2xl mx-auto w-full py-16 px-6">
        <nav className="flex items-center gap-2 text-xs font-mono mb-12 text-zinc-500">
          <Link to="/" className="hover:text-white transition-colors">
            home
          </Link>
          <ChevronRight size={12} />
          <span className="text-zinc-300">ingestion</span>
          <ChevronRight size={12} />
          <span className="text-zinc-600 truncate max-w-25">{ingestionId}</span>
        </nav>

        {(status === "processing" || status === "pending") && (
          <div className="mb-8 p-4 rounded-lg border border-zinc-800 bg-zinc-900/30 flex gap-4 items-start">
            <Info size={18} className="text-zinc-400 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="text-[13px] text-zinc-300 leading-relaxed">
                <span className="font-bold text-white mr-1">Beta Notice:</span>
                Due to limited compute resources, processing may take a few
                minutes. You can safely leave this page, Quark Team will email
                you when it's ready.
              </p>
            </div>
          </div>
        )}

        <div className="relative group">
          <div className="absolute -inset-px bg-white/5 rounded-xl opacity-20 transition duration-1000 group-hover:opacity-30" />

          <div className="relative bg-[#0A0A0A] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
            <div className="p-8">
              <div className="flex items-start justify-between gap-6">
                <div className="flex items-start gap-5">
                  <div className="mt-1">
                    {status === "processing" || status === "pending" ? (
                      <div className="relative w-12 h-12">
                        <div className="absolute inset-0 rounded-full border-[1.5px] border-zinc-800" />
                        <div className="absolute inset-0 rounded-full border-[1.5px] border-t-white border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                        <FileText className="absolute inset-0 m-auto w-5 h-5 text-zinc-500" />
                      </div>
                    ) : status === "completed" ? (
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                        <XCircle className="w-6 h-6 text-red-500" />
                      </div>
                    )}
                  </div>

                  <div>
                    <h1 className="text-xl font-medium text-white tracking-tight">
                      {data?.filename || "Preparing Document..."}
                    </h1>
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                        ID:{" "}
                        <span className="text-zinc-300 select-all">
                          {ingestionId}
                        </span>
                      </p>
                      <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest">
                        {data?.created_at
                          ? new Date(data.created_at).toLocaleString()
                          : "--"}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                    status === "completed"
                      ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-500"
                      : status === "failed"
                        ? "bg-red-500/5 border-red-500/20 text-red-500"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400"
                  }`}
                >
                  {status}
                </div>
              </div>

              <div className="mt-10 pt-6 border-t border-zinc-800/50">
                {status === "failed" ? (
                  <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-4">
                    <h4 className="text-[10px] font-bold text-red-500 uppercase mb-2 tracking-widest">
                      Runtime Error
                    </h4>
                    <p className="text-sm text-zinc-400 font-mono italic leading-relaxed">
                      "
                      {data?.err_msg ||
                        "Critical failure during vectorization."}
                      "
                    </p>
                  </div>
                ) : status === "completed" ? (
                  <div className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 p-4 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                      <span className="text-sm text-zinc-300 font-medium">
                        Ready for querying
                      </span>
                    </div>
                    {data?.session_id ? (
                      <Link
                        to={`/c/${data?.session_id}`}
                        className="flex items-center gap-2 text-xs font-bold text-black bg-white hover:bg-zinc-200 px-4 py-2 rounded-md transition-all"
                      >
                        Open Chat <ExternalLink className="w-3 h-3" />
                      </Link>
                    ) : (
                      <span className="text-xs text-zinc-500 font-mono">
                        session unavailable
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <span className="block text-[10px] text-zinc-500 font-mono uppercase tracking-[0.2em]">
                          Current Task
                        </span>
                        <span className="text-sm text-zinc-300 animate-pulse">
                          Scanning document structures...
                        </span>
                      </div>
                    </div>
                    <div className="relative w-full bg-zinc-900 h-px overflow-hidden">
                      <div className="absolute top-0 left-0 bg-white h-full w-1/4 animate-laser-progress shadow-[0_0_10px_white]" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <style>{`
        @keyframes laser-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(500%); }
        }
        .animate-laser-progress {
          animation: laser-progress 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}
