const out = process.stdout;

export const A = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  ul: "\x1b[4m",
  clearLine: "\r\x1b[2K",
  fg: (hex: string) => `\x1b[38;2;${rgb(hex)}m`,
};

function rgb(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0, 2), 16)};${parseInt(h.slice(2, 4), 16)};${parseInt(h.slice(4, 6), 16)}`;
}

export const C = {
  green: "#3fb950",
  blue: "#58a6ff",
  amber: "#d29922",
  red: "#f85149",
  purple: "#bc8cff",
  teal: "#79c0ff",
  text: "#e6edf3",
  dim: "#8b949e",
  faint: "#484f58",
  border: "#30363d",
};

export const G = {
  diamond: "◆",
  bullet: "▸",
  dot: "·",
  circle: "●",
  ring: "◌",
  check: "✓",
  cross: "✗",
  warn: "⚠",
  h: "─",
  v: "│",
  tl: "╭",
  tr: "╮",
  bl: "╰",
  br: "╯",
  ellipsis: "…",
};

export const paint = (t: string, color?: string, bold?: boolean) =>
  (bold ? A.bold : "") + (color ? A.fg(color) : "") + t + A.reset;

export const w = (t: string, c?: string, b?: boolean) =>
  out.write(paint(t, c, b));
export const wl = (t: string, c?: string, b?: boolean) =>
  out.write(paint(t, c, b) + "\n");
export const br = () => out.write("\n");
export const hr = (c = C.border) => wl(G.h.repeat(out.columns ?? 100), c);
export const cols = () => out.columns ?? 100;
export const nowTS = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const trunc = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1) + G.ellipsis : s;

export function wrap(text: string, width: number): string[] {
  if (!text) return [""];
  const w2 = Math.max(8, width);
  const res: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      res.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(" ")) {
      if (!word) continue;
      if (word.length >= w2) {
        if (line) {
          res.push(line);
          line = "";
        }
        for (let i = 0; i < word.length; i += w2)
          res.push(word.slice(i, i + w2));
        continue;
      }
      const next = line ? `${line} ${word}` : word;
      if (next.length <= w2) line = next;
      else {
        res.push(line);
        line = word;
      }
    }
    if (line) res.push(line);
  }
  return res.length ? res : [""];
}

const STRIP_ANSI = /\x1b\[[0-9;]*m/g;
const stripA = (s: string) => s.replace(STRIP_ANSI, "");

function inline(text: string): string {
  return text
    .replace(
      /\*\*(.+?)\*\*/g,
      (_, t) => A.bold + A.fg(C.text) + t + A.reset + A.fg(C.dim),
    )
    .replace(
      /`([^`\n]+)`/g,
      (_, t) => A.fg(C.teal) + A.bold + t + A.reset + A.fg(C.dim),
    )
    .replace(/\*([^*\n]+)\*/g, (_, t) => A.italic + t + A.reset + A.fg(C.dim));
}

export function renderMD(text: string, indent: number): string {
  const avail = Math.max(20, cols() - indent - 2);
  const pad = " ".repeat(indent);
  const lines = text.split("\n");
  const out2: string[] = [];
  let inCode = false;
  let codeLang = "";
  let codeBuf: string[] = [];

  const flushCode = () => {
    if (!codeBuf.length) return;
    const bw = Math.min(avail - 2, 72);
    out2.push(
      pad +
        A.fg(C.border) +
        G.tl +
        G.h.repeat(bw) +
        G.tr +
        A.reset +
        (codeLang ? "  " + A.fg(C.amber) + codeLang + A.reset : ""),
    );
    for (const cl of codeBuf) {
      const safe = cl.length > bw - 2 ? cl.slice(0, bw - 3) + G.ellipsis : cl;
      out2.push(
        pad +
          A.fg(C.border) +
          G.v +
          A.reset +
          " " +
          A.fg(C.teal) +
          safe +
          A.reset,
      );
    }
    out2.push(pad + A.fg(C.border) + G.bl + G.h.repeat(bw) + G.br + A.reset);
    codeBuf = [];
    codeLang = "";
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trimStart().startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
        codeLang = line.replace(/```/g, "").trim();
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }

    // heading
    const hm = line.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      out2.push(pad + A.bold + A.fg(C.green) + hm[2]! + A.reset);
      continue;
    }

    // blockquote
    if (line.startsWith("> ")) {
      out2.push(
        pad +
          A.fg(C.faint) +
          G.v +
          A.reset +
          " " +
          A.dim +
          A.fg(C.dim) +
          line.slice(2) +
          A.reset,
      );
      continue;
    }

    // bullet
    const bm = line.match(/^(\s*)([-*•])\s+(.+)/);
    if (bm) {
      const extra = "  ";
      const wlines = wrap(stripA(bm[3]!), avail - (bm[1]?.length ?? 0) - 2);
      out2.push(
        pad +
          bm[1] +
          A.fg(C.amber) +
          G.bullet +
          A.reset +
          " " +
          A.fg(C.dim) +
          inline(wlines[0]!) +
          A.reset,
      );
      for (const wl2 of wlines.slice(1))
        out2.push(pad + bm[1] + extra + A.fg(C.dim) + inline(wl2) + A.reset);
      continue;
    }

    // numbered list
    const nm = line.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (nm) {
      out2.push(
        pad +
          nm[1] +
          A.fg(C.amber) +
          nm[2] +
          "." +
          A.reset +
          " " +
          A.fg(C.dim) +
          inline(nm[3]!) +
          A.reset,
      );
      continue;
    }

    // blank
    if (!line.trim()) {
      out2.push("");
      continue;
    }

    // paragraph — word-wrap
    for (const wline of wrap(line, avail))
      out2.push(pad + A.fg(C.dim) + inline(wline) + A.reset);
  }

  if (inCode) flushCode();
  return out2.join("\n");
}
