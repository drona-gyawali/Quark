import {Elysia} from "elysia";
import type { User } from "@supabase/supabase-js";
import { me } from "../utils.ts";
import { logger } from "../../conf/logger.ts";

export const profileView = new Elysia({prefix: "/profile"})
    .decorate('user', null as unknown as User | null)
    .get("/me", async ({user, set}) => {
        if(!user) {
            set.status = 401
            return {error: "Unauthorized Access"}
        }

        const userId = user.id
        const data = await me(userId)
        if(!data.id){
            set.status = 401;
            return {error: "Invalid UserId"}
        }

        return data
    })
    .onError(({code, error, set}) => {
        set.status = 500
        logger.error(`Error in profile ${error}`)
        return {error : "Internal Server Error", code: code}
    })
