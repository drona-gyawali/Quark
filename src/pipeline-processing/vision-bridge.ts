import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "node:url";
import { logger } from "../conf/logger.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getLocalImages = (
  fileBuffer: Buffer,
): Promise<{
  doc_id: string;
  images: { page: number; s3_key: string }[];
}> => {
  return new Promise((resolve, reject) => {
    const projectRoot =
      process.env.QUARK_ROOT || path.resolve(__dirname, "../../");

    const venvPath =
      process.platform === "win32"
        ? path.join(projectRoot, "venv", "Scripts", "python.exe")
        : path.join(projectRoot, "venv", "bin", "python");

    const envPython = process.env.PYTHON_BIN;

    let pythonPath: string;
    let isFallbackPython3 = false;

    if (envPython) {
      pythonPath = envPython;
    } else if (fs.existsSync(venvPath)) {
      pythonPath = venvPath;
    } else {
      pythonPath = "python3";
      isFallbackPython3 = true;
    }

    const scriptPath = path.join(projectRoot, "bin", "vision-worker.py");

    logger.debug(`[CONFIG]: Using Python at: ${pythonPath}`);
    logger.debug(`[CONFIG]: Using Script at: ${scriptPath}`);

    // --- Validation ---
    // Only skip existence check if it's our fallback "python3"
    if (!isFallbackPython3 && !fs.existsSync(pythonPath)) {
      const error = `Python binary not found at: ${pythonPath}`;
      logger.error(`[CONFIG ERROR]: ${error}`);
      return reject(new Error(error));
    }

    if (!fs.existsSync(scriptPath)) {
      const error = `Vision worker script not found at: ${scriptPath}`;
      logger.error(`[CONFIG ERROR]: ${error}`);
      return reject(new Error(error));
    }

    // --- Spawn Python Process ---
    const pythonProcess = spawn(pythonPath, [scriptPath]);

    let dataString = "";
    let errorString = "";

    pythonProcess.stdin.write(fileBuffer);
    pythonProcess.stdin.end();

    pythonProcess.stdout.on("data", (data) => {
      dataString += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      errorString += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        logger.error(`[PYTHON ERROR]: ${errorString}`);
        reject(
          new Error(`Python process exited with code ${code}: ${errorString}`),
        );
      } else {
        try {
          const parsed = JSON.parse(dataString);
          resolve(parsed);
        } catch {
          logger.error(`[PARSING ERROR]: Data was: ${dataString}`);
          reject(new Error("Failed to parse Python output as JSON"));
        }
      }
    });
  });
};
