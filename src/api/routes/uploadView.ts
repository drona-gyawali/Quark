import {Elysia} from "elysia";
import { createPresignedUrl } from "../../service/object.ts";
import  { KeySchema } from "../../lib/lib.ts";
import { logger } from "../../conf/logger.ts";

export const UploadView = new Elysia({prefix: "/ingest"},)
    .post("/upload/url", async ({body, set}) => {
        const _res = await createPresignedUrl(body)
        set.status = 200
        logger.info(`Temporary Uplaod url has been created sucessfully ${_res.key}`)
        return {"uploadData": _res}
    }, {
        body: KeySchema
    })
    .onError(({code, error,set}) => {
        set.status = 500
        logger.error(`Error Occred while creating upload url : ${error}`)
        return {error: error, code: code}
    })
    
    