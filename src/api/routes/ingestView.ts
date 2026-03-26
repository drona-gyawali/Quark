import {Elysia} from "elysia"
import { ingestion_helper } from "../utils.ts"
import { IngestionSchema } from "../../lib/lib.ts"

// not  tested.. 
export const IngestRoutes = new Elysia({prefix: "/ingest", })
    .post("/process", async ({body, set}, ) => {
        const res = await ingestion_helper(body)
        set.status = 201
        return {data: res}
    }, {
        body: IngestionSchema
    })
    .onError(({code ,error, set}) => {
        set.status = 500
        return {error: error, code: code}
    })