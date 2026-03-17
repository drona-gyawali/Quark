import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../conf/logger.ts";

// TODO: add worker to scale it in prod...
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getLocalImages = (
  pdfPath: string,
): Promise<Record<number, string[]>> => {
  return new Promise((resolve, reject) => {
    const absolutePdfPath = path.resolve(pdfPath);

    const pythonPath = path.join(process.cwd(), "venv", "bin", "python");

    const pythonProcess = spawn(pythonPath, [
      path.join(__dirname, "vision-worker.py"),
      absolutePdfPath,
    ]);

    let dataString = "";
    let errorString = "";

    pythonProcess.stdout.on("data", (data) => {
      dataString += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      errorString += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        logger.error(`[PYTHON ERROR]: ${errorString}`);
        reject(`Python process exited with code ${code}`);
      } else {
        try {
          resolve(JSON.parse(dataString));
        } catch {
          logger.error(`[PARSING ERROR]: Data was: ${dataString}`);
          reject("Failed to parse Python output as JSON");
        }
      }
    });
  });
};
