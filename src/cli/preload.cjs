"use strict";

const { mkdirSync, createWriteStream } = require("fs");
const path = require("path");
const os   = require("os");

if (!global.window) global.window = global;
if (!global.window.crypto) {
  global.window.crypto =
    global.crypto ||
    (() => { try { return require("crypto").webcrypto; } catch(e) { return {}; } })();
}

const DIR      = path.join(os.homedir(), ".learnrag");
const LOG_FILE = path.join(DIR, "pipeline.log");
mkdirSync(DIR, { recursive: true });
const logDest = createWriteStream(LOG_FILE, { flags: "a" });

const ANSI_RE = /\x1b\[[0-9;]*m/g;

const LOG_RE = /^(\[|Env |Failed to |dotenv|\{"level":|pino)/;

function isLog(line) {
  return LOG_RE.test(line.replace(ANSI_RE, "").trimStart());
}

const _orig = process.stdout.write.bind(process.stdout);

process.stdout.write = function(chunk, enc, cb) {
  const text     = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  const callback = typeof enc === "function" ? enc : cb;
  const encoding = typeof enc === "function" ? "utf8" : (enc || "utf8");

  // single-line fast path
  if (!text.includes("\n") || text === "\n") {
    if (isLog(text)) {
      logDest.write(text.endsWith("\n") ? text : text + "\n");
      if (callback) callback();
      return true;
    }
    return _orig(text, encoding, callback);
  }

  // multi-line: route each line
  const lines = text.split("\n");
  const keep  = [];
  const trash = [];
  lines.forEach(function(line, i) {
    if (i === lines.length - 1 && line === "") { keep.push(""); return; }
    if (isLog(line)) trash.push(line);
    else keep.push(line);
  });
  if (trash.length) logDest.write(trash.join("\n") + "\n");
  const out = keep.join("\n");
  if (out && out !== "\n") return _orig(out, encoding, callback);
  if (callback) callback();
  return true;
};
