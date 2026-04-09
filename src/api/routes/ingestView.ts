import {Elysia} from "elysia"
import { generateJobId } from "../utils.ts"
import { IngestionSchema } from "../../lib/lib.ts"
import { logger } from "../../conf/logger.ts"
import { IngestionQueue } from "../../shared/queue-config.ts"
import { createIngestLog, getIngestionLog, updateIngestLog } from "../../service/ingest.ts"
import type { User } from "@supabase/supabase-js"
import { APIException } from "../../conf/exec.ts"

export const IngestRoutes = new Elysia({prefix: "/ingest", })
    .decorate('user', null as unknown as User | null)
    .get("/status/:ingestId", async ({params: {ingestId}, user, set}, ) => {
        if(!user) {
            set.status = 401
            return {error: "Unauthorized Access"}
        }
        const res = await getIngestionLog(ingestId)
        set.status = 200
        logger.info(`Getting ingestion status for ${ingestId}`)
        return {data: res}
    })
    .post("/process", async ({body, user, set}, ) => {
        if(!user) {
            set.status = 401
            return {error: "Unauthorized Access"}
        }
        const res = await createIngestLog({
            filename: body.filename,
            session_id: body.session_id,
            status: "pending"
        })
        if(!res.id) {
            set.status = 503
            logger.error(`Maybe DB is down or connection string problem`)
            return {error : "Db cannot process ingestion data"}
        }
        try {
            const job = await IngestionQueue.add("process-doc", {
                key: body.key,
                filename: body.filename,
                session_id: body.session_id,
                ingest_id: res.id
            }, {
                jobId: generateJobId(body.filename)
            })

            set.status = 202
            logger.info(`Ingestion started processing via worker with ${job.id}`)
            return {data: {
                message: "Ingestion process started",
                jobId: job.id,
                ingestId: res.id,
                status:"Queued"
            }}
        } catch(error) {
            await updateIngestLog({ status: "failed" }, res.id)
            throw new APIException(`Error occured in ingestion Api : ${error}`)
        }

    }, {
        body: IngestionSchema
    })
    .onError(({code ,error, set}) => {
        set.status = 500
        logger.info(`Ingestion processing has been failed:  ${error}`)
        return {error: "Internal Server Error", code: code}
    })