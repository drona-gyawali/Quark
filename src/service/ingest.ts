import { db } from "../lib/superbase.ts";
import type { Json } from "../lib/database.types.ts";
import { logger } from "../conf/logger.ts";
import { SuperBaseException } from "../conf/exec.ts";

export interface IngestLog {
    session_id:string
    filename:string
    chunks:number
    visualChunks:number
    status:string|null
    err_msg?:string
    metadata?:Json | null
}


export const createIngestLog = async (logs:IngestLog) => {
    try {
        const {data, error} = await db.from("ingest_log").insert([
            {
                session_id: logs.session_id,
                filename: logs.filename,
                chunks : logs.chunks,
                visual_chunks: logs.visualChunks,
                status: logs.status,
                err_msg: logs.err_msg,
                metadata: logs.metadata
            }
        ]).select().single()
        if(error) {
            logger.error(`Error occured while ingesting file for ${logs.session_id} :  ${error.message}`)
            throw new SuperBaseException(`Error occured while ingesting file for for ${logs.session_id} : ${error.message}`)
        }

        return data
    } catch (error) {
        logger.error(`Error occured while ingesting file for ${logs.session_id} :  ${error}`)
        throw new SuperBaseException(`Error occured while ingesting file for for ${logs.session_id} : ${error}`)
    }
}


export const updateIngestLog = async (logs:IngestLog, ingestId:string) => {
    try {
        const {data, error} = await db.from("ingest_log").update(logs).eq("id", ingestId).select().single()
        if(error) {
            logger.error(`Error occured while updating ingest file for ${ingestId} :  ${error.message}`)
            throw new SuperBaseException(`Error occured while updating ingest file for for ${ingestId} : ${error.message}`)
        }

        return data
    } catch (error) {
        logger.error(`Error occured while ingesting file for ${logs.session_id} :  ${error}`)
        throw new SuperBaseException(`Error occured while ingesting file for for ${logs.session_id} : ${error}`)
    }
}

