import { Elysia, t } from "elysia";
import { retriver_helper } from "../utils.ts";
import { viewChats } from "../../service/chat.ts";
import { deleteChats } from "../../service/chat.ts";
import type { User } from "@supabase/supabase-js";
import type { ChatCompletionChunk } from "openai/resources";


export const RetriveView = new Elysia({ prefix: "/chat", })
    .decorate('user', null as unknown as User | null)
    .get("/history/:sessionId" ,async ({ params: { sessionId }, query, set }) => {
        try {
            const parsedPage = parseInt(query.page ?? "0")
            const page = Number.isInteger(parsedPage) && parsedPage >= 0 ? parsedPage : 0;
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
                error: "Internal Server Error"
            };
        }
    })
    .delete("/:sessionId", async ({params: {sessionId}, set}) => {
        try {
            const isDeleted = await deleteChats(sessionId)
            if(!isDeleted) {
                set.status=400
                return {error: "Session deletion failed"}
            }
            set.status=204
            return
        }catch (error: any) {
            set.status = 500;
            return {
                success: false,
                error: "Internal Server Error"
            };
        }
    })
    .post("/completions", async ({ user , body, set }) => {
        try {
            if(!user) {
                set.status = 401
                return {error: "Unauthorized Access"}
            }
            const userId = user.id
            const result = await retriver_helper(
                { 
                    message: body.message, 
                    sessionId: body.sessionId, 
                } as any,
                { message: body.message, userId: userId, sessionId: body.sessionId } as any,
                { message: body.message, userId: userId, sessionId: body.sessionId, query: body.message, response: "" } as any
            );

            set.headers['Content-Type'] = 'text/event-stream';

            return new ReadableStream({
                async start(controller) {
                    const encoder = new TextEncoder()
                    try {
                        for await (const chunk of result?.stream as  AsyncGenerator<ChatCompletionChunk, void, unknown>){
                            const content = chunk.choices[0].delta?.content ?? ""
                            if(content) {
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
                            }
                        }
                    } finally {
                        controller.close();
                    }
                }
            })

        } catch (error: any) {
            set.status = 500;
            return {
                success: false,
                error: "Internal Server Error"
            };
        }
    }, {
        body: t.Object({
            message: t.String(),
            sessionId: t.String(),
        })
    });
    