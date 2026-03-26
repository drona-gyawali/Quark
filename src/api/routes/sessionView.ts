import { createSession, deleteSession, updateSession, getSession } from "../../service/session.ts";
import {Elysia, t} from "elysia";
import { logger } from "../../conf/logger.ts";

export const SessionView = new Elysia({ prefix: "/session" })
    .get("/:userId", async ({ params: { userId }, set }) => {
        const res = await getSession(userId)
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
    .post("/:userId", async ({ params: { userId }, body, set }) => {
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
    .onError(({ error, set }) => {
        set.status = 500;
        logger.error(`Error occured in Sessions API | ${error}`)
        return { 
            success: false, 
            error: error || "Internal Server Error" 
        };
    });