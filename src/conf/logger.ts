import pino from "pino";
import fs from "fs";
import { join } from "path";

const logDir = "./logs";
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const _ = [
  { stream: process.stdout },
  {
    stream: pino.destination({ dest: join(logDir, "app.ts.log"), sync: false }),
  },
];

const logger = pino({
  level: process.env.PINO_LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: {
    targets: [
      {
        target: "pino-pretty",
        level: process.env.PINO_LOG_LEVEL || "info",
        options: { colorize: true },
      },
      {
        target: "pino/file",
        level: process.env.PINO_LOG_LEVEL || "info",
        options: { destination: join(logDir, "app.ts.log") },
      },
    ],
  },
});
export { logger };
