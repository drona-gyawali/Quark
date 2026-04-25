import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { logger } from "../conf/logger.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT =
  process.env.QUARK_ROOT ?? path.resolve(__dirname, "../../");

export const getLocalImages = (
  pdfPath: string,
): Promise<Record<number, string[]>> => {
  return new Promise((resolve, reject) => {
    const absolutePdfPath = path.resolve(pdfPath);

    const defaultVenv =
      process.platform === "win32"
        ? path.join(PROJECT_ROOT, "venv", "Scripts", "python.exe")
        : path.join(PROJECT_ROOT, "venv", "bin", "python");

    const pythonPath =
      process.env.PYTHON_BIN ??
      (fs.existsSync(defaultVenv) ? defaultVenv : "python3");

    const scriptPath = path.join(PROJECT_ROOT, "bin", "vision-worker.py");

    if (pythonPath !== "python3" && !fs.existsSync(pythonPath)) {
      const error = `Python binary not found at: ${pythonPath}`;
      logger.error(`[CONFIG ERROR]: ${error}`);
      return reject(error);
    }

    if (!fs.existsSync(scriptPath)) {
      const error = `Vision worker script not found at: ${scriptPath}`;
      logger.error(`[CONFIG ERROR]: ${error}`);
      return reject(error);
    }

    const pythonProcess = spawn(pythonPath, [scriptPath, absolutePdfPath]);

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
