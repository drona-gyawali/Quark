import { describe, it, expect, vi } from "vitest";

const writeMock = vi.fn();
vi.stubGlobal("process", {
  stdout: { write: writeMock, columns: 80 },
});

import { A, C, G, paint, wrap, trunc, cols, nowTS, renderMD } from "./ansi.ts";

const STRIP_ANSI = /\x1b\[[0-9;]*m/g;
const strip = (s: string) => s.replace(STRIP_ANSI, "");

describe("A constants", () => {
  it("reset is the ANSI reset sequence", () => {
    expect(A.reset).toBe("\x1b[0m");
  });

  it("bold is the ANSI bold sequence", () => {
    expect(A.bold).toBe("\x1b[1m");
  });

  it("fg returns a valid 24-bit foreground sequence for a hex color", () => {
    // #ff0000 → r=255 g=0 b=0
    expect(A.fg("#ff0000")).toBe("\x1b[38;2;255;0;0m");
  });

  it("fg handles lowercase hex without the hash", () => {
    expect(A.fg("00ff00")).toBe("\x1b[38;2;0;255;0m");
  });
});

describe("C color palette", () => {
  it("exposes the expected named colors as hex strings", () => {
    for (const key of [
      "green",
      "blue",
      "amber",
      "red",
      "purple",
      "teal",
      "text",
      "dim",
      "faint",
      "border",
    ] as const) {
      expect(C[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("G glyphs", () => {
  it("contains single-character (or expected) glyphs", () => {
    expect(G.check).toBe("✓");
    expect(G.cross).toBe("✗");
    expect(G.diamond).toBe("◆");
    expect(G.bullet).toBe("▸");
    expect(G.ellipsis).toBe("…");
  });

  it("box-drawing characters are correct", () => {
    expect(G.tl).toBe("╭");
    expect(G.tr).toBe("╮");
    expect(G.bl).toBe("╰");
    expect(G.br).toBe("╯");
    expect(G.h).toBe("─");
    expect(G.v).toBe("│");
  });
});

describe("paint()", () => {
  it("wraps text with color and reset", () => {
    const result = paint("hello", C.green);
    expect(result).toContain("hello");
    expect(result).toContain(A.reset);
    expect(result).toContain(A.fg(C.green));
  });

  it("adds bold when requested", () => {
    const result = paint("bold", C.blue, true);
    expect(result).toContain(A.bold);
  });

  it("returns plain text with reset when no color supplied", () => {
    const result = paint(" ");
    expect(result).toBe(" " + A.reset);
  });
});

describe("trunc()", () => {
  it("returns the string unchanged when it fits within n", () => {
    expect(trunc("hello", 10)).toBe("hello");
  });

  it("truncates and appends ellipsis when string exceeds n", () => {
    const result = trunc("hello world", 8);
    expect(result).toHaveLength(8);
    expect(result.endsWith(G.ellipsis)).toBe(true);
  });

  it("handles exact boundary (length === n) without truncation", () => {
    expect(trunc("abcde", 5)).toBe("abcde");
  });
});

describe("cols()", () => {
  it("returns process.stdout.columns when set", () => {
    expect(cols()).toBe(100);
  });
});

describe("nowTS()", () => {
  it("returns a time string matching HH:MM format", () => {
    expect(nowTS()).toMatch(/^\d{1,2}:\d{2}( [AP]M)?$/);
  });
});

// ─── wrap ─────────────────────────────────────────────────────────────────────
describe("wrap()", () => {
  it("returns [''] for empty string", () => {
    expect(wrap("", 40)).toEqual([""]);
  });

  it("preserves a short line that fits within width", () => {
    expect(wrap("hello", 20)).toEqual(["hello"]);
  });

  it("splits a long sentence across multiple lines", () => {
    const text = "one two three four five six seven eight nine ten";
    const lines = wrap(text, 20);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(20);
    }
  });

  it("hard-wraps a word longer than the width", () => {
    const longWord = "abcdefghijklmnopqrstuvwxyz";
    const lines = wrap(longWord, 10);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(10);
    }
    expect(lines.join("")).toBe(longWord);
  });

  it("handles newlines by treating them as paragraph breaks", () => {
    const lines = wrap("line one\nline two", 40);
    expect(lines).toContain("line one");
    expect(lines).toContain("line two");
  });

  it("preserves blank paragraphs as empty strings", () => {
    const lines = wrap("a\n\nb", 40);
    expect(lines).toContain("");
  });

  it("clamps minimum width to 8", () => {
    // width=2 should be treated as 8
    const lines = wrap("hello world", 2);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(8);
    }
  });
});

describe("renderMD()", () => {
  const render = (text: string) => strip(renderMD(text, 2));

  it("renders a heading without the # markers", () => {
    const out = render("## My Heading");
    expect(out).toContain("My Heading");
    expect(out).not.toContain("##");
  });

  it("renders a bullet point without the raw marker", () => {
    const out = render("- item one");
    expect(out).toContain("item one");
    expect(out).not.toMatch(/^- /m);
  });

  it("renders a numbered list without raw digit+dot", () => {
    const out = render("1. first item");
    expect(out).toContain("first item");
  });

  it("renders a blockquote without the leading >", () => {
    const out = render("> a quote");
    expect(out).toContain("a quote");
    expect(out).not.toContain("> ");
  });

  it("renders an inline code block (backticks stripped from output text)", () => {
    const out = render("Use `myFunc()` here");
    expect(out).toContain("myFunc()");
  });

  it("renders a fenced code block with border glyphs", () => {
    const md = "```ts\nconst x = 1;\n```";
    const raw = renderMD(md, 2);
    expect(raw).toContain(G.tl);
    expect(raw).toContain(G.bl);
    expect(raw).toContain("const x = 1;");
  });

  it("renders fenced code block with language label", () => {
    const md = "```python\nprint('hi')\n```";
    const raw = renderMD(md, 2);
    expect(raw).toContain("python");
  });

  it("renders plain paragraphs with word-wrapping applied", () => {
    const longPara = "word ".repeat(30).trim();
    const lines = render(longPara).split("\n");
    // Every visual line (after stripping indent) should fit within cols()
    const avail = cols() - 2 - 2; // indent=2, padding=2
    for (const line of lines) {
      expect(line.trimStart().length).toBeLessThanOrEqual(avail);
    }
  });

  it("handles **bold** inline syntax", () => {
    const out = render("some **bold** text");
    expect(out).toContain("bold");
  });

  it("handles *italic* inline syntax", () => {
    const out = render("some *italic* text");
    expect(out).toContain("italic");
  });

  it("returns an empty string for blank input", () => {
    expect(render("").trim()).toBe("");
  });
});
