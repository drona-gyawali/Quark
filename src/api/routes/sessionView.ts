import { createSession, deleteSession, updateSession, getSession } from "../../service/session.ts";
import {Elysia, t,} from "elysia";
import { logger } from "../../conf/logger.ts";
import  type { User } from "@supabase/supabase-js";


export const SessionView = new Elysia({ prefix: "/session" })
    .decorate('user', null as unknown as User | null)
    .get("/", async ({ user, set }) => {
        if(!user) {
            set.status = 401
            return {error: "Unauthorized Access"}
        }
        const res = await getSession(user.id)
        set.status = 200;
        return res;
    })
    .delete("/:sessionId", async ({ params: { sessionId }, set }) => {
        await deleteSession(sessionId);
        set.status = 204;
        return; 
    })
    .patch("/:sessionId", async ({params: {sessionId}, body, set}) => {
        const res = await updateSession(sessionId, body.label)
        set.status = 200
        return {data: res}
    }, {
        body: t.Object({
            label:t.String()
        })
    })
    .post("/", async ({ user, body, set }) => {
        if(!user) {
            set.status = 401
            return {error: "Unauthorized Access"}
        }
        const userId = user.id
        const res = await createSession({
            user_id: userId,
            label: body.label
        });
        set.status = 201;
        return { data: res };
    }, {
        body: t.Object({
            label: t.String()
        })
    })
    .onError(({ code,error, set }) => {
        set.status = 500;
        logger.error(`Error occured in Sessions API | ${error}`)
        return { 
            success: false, 
            error: "Internal Server Error",
            code: code 
        };
    });