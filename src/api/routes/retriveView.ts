import { Elysia, t } from "elysia";
import { retriver_helper } from "../utils.ts";
import { viewChats } from "../../service/chat.ts";
import { deleteChats } from "../../service/chat.ts";

export const RetriveView = new Elysia({ prefix: "/chat", })
    .get("/history/:sessionId" ,async ({ params: { sessionId }, query, set }) => {
        try {
            const page = parseInt(query.page || "0")

            const result = await viewChats({
                sessionId: String(sessionId),
                page: page,
                limit: 20
            })

            set.status = 200
            return {success: true, data: result}
        }catch (error: any) {
            set.status = 500;
            return {
                success: false,
                error: error?.message ?? "Internal Server Error"
            };
        }
    })
    .delete("/:sessionId", async ({params: {sessionId}, set}) => {
        try {
            await deleteChats(sessionId)
            set.status=204
            return
        }catch (error: any) {
            set.status = 500;
            return {
                success: false,
                error: error?.message ?? "Internal Server Error"
            };
        }
    })
    .post("/completions", async ({ body, set }) => {
        try {
            const result = await retriver_helper(
                { 
                    message: body.message, 
                    sessionId: body.sessionId,
                    filters: { institution: body.institution, mode: 0 } 
                } as any,
                { message: body.message, userId: body.userId, sessionId: body.sessionId } as any,
                { message: body.message, userId: body.userId, sessionId: body.sessionId, query: body.message, response: "" } as any
            );

            return {
                success: true,
                data: result.answer
            };

        } catch (error: any) {
            set.status = 500;
            return {
                success: false,
                error: error?.message ?? "Internal Server Error"
            };
        }
    }, {
        body: t.Object({
            message: t.String(),
            sessionId: t.String(),
            userId: t.String(),
            institution: t.Optional(t.String())
        })
    });
    