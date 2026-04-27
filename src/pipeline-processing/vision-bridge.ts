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
    try {
      const projectRoot =
        process.env.QUARK_ROOT || path.resolve(__dirname, "../../");

      const pythonPath = process.env.PYTHON_BIN || "python3";

      const scriptPath = path.join(projectRoot, "bin", "vision-worker.py");

      logger.debug(`[CONFIG]: Using Python at: ${pythonPath}`);
      logger.debug(`[CONFIG]: Using Script at: ${scriptPath}`);

      if (!fs.existsSync(scriptPath)) {
        const error = `Vision worker script not found at: ${scriptPath}`;
        logger.error(`[CONFIG ERROR]: ${error}`);
        return reject(new Error(error));
      }

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

      pythonProcess.on("error", (err) => {
        logger.error(`[SPAWN ERROR]: ${err.message}`);
        reject(new Error(`Failed to start Python process: ${err.message}`));
      });

      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          logger.error(`[PYTHON ERROR]: ${errorString}`);
          return reject(
            new Error(
              `Python process exited with code ${code}: ${errorString}`,
            ),
          );
        }

        try {
          const parsed = JSON.parse(dataString);
          resolve(parsed);
        } catch (err) {
          logger.error(`[PARSING ERROR]: Data was: ${dataString}`);
          reject(new Error("Failed to parse Python output as JSON"));
        }
      });
    } catch (err: any) {
      logger.error(`[UNEXPECTED ERROR]: ${err.message}`);
      reject(err);
    }
  });
};
