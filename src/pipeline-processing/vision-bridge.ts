import { spawn } from "child_process";
import path from "path";
import { logger } from "../conf/logger.ts";

export const getLocalImages = (
  pdfPath: string,
): Promise<Record<number, string[]>> => {
  return new Promise((resolve, reject) => {
    const absolutePdfPath = path.resolve(pdfPath);

    const rootDir = process.cwd();

    const pythonPath = path.join(rootDir, "venv", "bin", "python");
    const scriptPath = path.join(rootDir, "bin", "vision-worker.py");

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
