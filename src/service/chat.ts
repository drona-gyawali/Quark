import { db } from "../lib/superbase.ts";
import { SuperBaseException } from "../conf/exec.ts";
import { logger } from "../conf/logger.ts";
import type { ChatView } from "../lib/lib.ts";

interface ChatLog {
    session_id:string;
    content:string
    role:string
}

// this might be slower in prod we either batch the chats in bg or processed once 
// for e.g 10 chats or inactive session for more then 10 minute than store in db
// the core: if chat is frequent donot hit db everytime, we want fu**king high throughput.
export const dumpChatHistory = async (chat:ChatLog) => {
    try {
        const {data, error} = await db.from("chat_log").insert([
            {
                session_id: chat.session_id,
                role:chat.role,
                content:chat.content,
            }
        ]).select().single()

        if(error) {
            logger.error(`Error while dumping the chat: ${error.message}`)
            throw new SuperBaseException(`Error while dumping the chat: ${error.message}`)
        }

        return data
    } catch (error) {
        logger.error(`Error while dumping the chat: ${error}`)
        throw new SuperBaseException(`Error while dumping the chat: ${error}`)
    }
}


export const deleteChat = async (chat_id:string) => {
    try {
        const {data, error} = await db.from("chat_log").delete().eq("id", chat_id).select()
        if(error) {
            logger.info(`Error occured while deleting ${chat_id} : ${error.message}`)
            throw new SuperBaseException(`Error occured while deleting ${chat_id} : ${error.message}`)
        }

        return data
    } catch(error) {
        logger.info(`Error occured while deleting ${chat_id} : ${error}`)
        throw new SuperBaseException(`Error occured while deleting ${chat_id} : ${error}`)
    }
}

export const  deleteChats = async (session_id:string) => {
    try {
        const {data, error} = await db.from("chat_log").delete().eq("session_id", session_id).select()
        if(error) {
            logger.error(`Error Occurred while deleting all sessions chat ${error.message}`)
            return false
        }

        return true
    }catch (error)  {
        logger.error(`Error Occurred while deleting all sessions chat ${error}`)
        throw new SuperBaseException(`Error occured while deleting all sessions chat ${error}`)
    }

}


export const viewChats = async (view:ChatView) => {
    try{
        const { data, error } = await db.rpc('get_paginated_chat_v1', {
            p_session_id: view.sessionId,
            p_page: view.page,
            p_page_size: view.limit
        });

        if(error) {
            logger.error(`Error Occured while fetching chat history : ${error.message}`)
            throw new SuperBaseException(`Error Occured while fetching chat history : ${error.message}`)
        }

        return data
    }catch (error) {
        logger.error(`Error Occured while fetching chat history : ${error}`)
        throw new SuperBaseException(`Error Occured while fetching chat history : ${error}`)
    }
}