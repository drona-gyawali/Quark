import { Link } from "react-router-dom";
import { Mail, MapPin } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full border-t border-zinc-800 bg-zinc-950 py-6 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex flex-col items-center gap-1 md:items-start">
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-200">
              Quark Inc.
            </span>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">
              © {currentYear} All Rights Reserved
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-[10px] uppercase tracking-widest text-zinc-400">
            <div className="flex items-center gap-2 transition-colors hover:text-zinc-200 cursor-default">
              <MapPin className="h-3 w-3 text-zinc-600" />
              <span>Butwal, Nepal</span>
            </div>

            <Link
              to="mailto:contact@quark.inc"
              className="flex items-center gap-2 transition-colors hover:text-zinc-100"
            >
              <Mail className="h-3 w-3 text-zinc-600" />
              <span>Contact Support</span>
            </Link>

            <div className="h-3 w-px bg-zinc-800 hidden md:block" />

            <span className="text-zinc-600 italic lowercase tracking-normal">
              Made in Nepal
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
