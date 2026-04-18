import { useIngestionStatus } from "@/hooks/use-ingestion-status";
import {
  CheckCircle2,
  XCircle,
  FileText,
  ExternalLink,
  ArrowBigLeftDashIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useParams, Navigate } from "react-router-dom";

export function Processing() {
  const { ingestionId } = useParams<{ ingestionId: string }>();
  if (!ingestionId) {
    return <Navigate to="/something-went-wrong" replace />;
  }
  const { data } = useIngestionStatus(ingestionId);
  const status = data?.status || "pending";

  return (
    <div className="max-w-2xl mx-auto py-16 px-6 font-sans">
      <Link
        to="/"
        className="hover:text-white text-[19px] transition-colors flex items-center gap-1.5 font-mono text-zinc-500 mb-6 tracking-tight"
      >
        <ArrowBigLeftDashIcon size={19} />
        <span> return </span>
      </Link>
      <nav className="gap-2 text-[11px] font-mono text-zinc-500 mb-6 tracking-tight"></nav>

      <div className="relative group">
        <div className="absolute -inset-px bg-linear-to-r from-zinc-800 to-zinc-700 rounded-xl opacity-20 transition duration-1000 group-hover:opacity-30" />

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
                    <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                      ID:{" "}
                      <span className="text-zinc-300 select-all">
                        {ingestionId}
                      </span>
                    </p>
                    <p className="text-xs text-zinc-600 font-mono">
                      Timestamp:{" "}
                      {data?.created_at
                        ? new Date(data.created_at).toLocaleString()
                        : "--"}
                    </p>
                  </div>
                </div>
              </div>

              <div
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
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
                    "{data?.err_msg || "Critical failure during vectorization."}
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
                  <button className="flex items-center gap-2 text-xs font-bold text-white bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-md transition-all">
                    Open Inspector <ExternalLink className="w-3 h-3" />
                  </button>
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
