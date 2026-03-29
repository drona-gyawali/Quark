import {Elysia} from "elysia";
import { createPresignedUrl } from "../../service/object.ts";
import  { KeySchema } from "../../lib/lib.ts";
import { logger } from "../../conf/logger.ts";
import type { User } from "@supabase/supabase-js";

export const UploadView = new Elysia({prefix: "/ingest"},)
    .decorate('user', null as unknown as User | null)
    .post("/upload/url", async ({user, body, set}) => {
        if(!user) {
            set.status = 401
            return {error: "Unauthorized Access"}
        }
        const user_id = user.id
        const _res = await createPresignedUrl({...body, user_id})
        if("SizeError" in _res ||"TypeError" in _res) {
            set.status = 400
            return { error: _res.SizeError ?? _res.TypeError }
        } 
        set.status = 200
        logger.info(`Temporary Uplaod url has been created sucessfully for ${user_id}`)
        return {"uploadData": _res}
    }, {
        body: KeySchema
    })
    .onError(({code, error,set}) => {
        set.status = 500
        logger.error(`Error Occred while creating upload url : ${error}`)
        return {error: "Internal Server Error", code: code}
    })
    
    