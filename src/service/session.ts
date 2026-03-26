import { db } from "../lib/superbase.ts";
import { SuperBaseException } from "../conf/exec.ts";

interface Sessions {
    user_id:string
    label:string
}

export const createSession = async (sessions:Sessions) => {
    try{
        const {data, error}  = await db.from("sessions").insert([
            {
                user_id: sessions.user_id,
                label: sessions.label
            }
        ]).select().single();

        if(error) {
            throw new SuperBaseException(`Error Occured while creating session: ${error}`)
        }
        return data;
    }catch(err:unknown) {
        throw new SuperBaseException(`Error Occured while creating session: ${err}`)
    }
}


export const getSession = async (userId:string) => {
    try{
        const { data, error } = await db
        .from("sessions")
        .select("*") 
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

        if(error) {
            throw new SuperBaseException(`Error Occured while fetching session: ${error}`)
        }
        return data;
    }catch(err:unknown) {
        throw new SuperBaseException(`Error Occured while fetching session: ${err}`)
    }
}


export const deleteSession = async (session_id:string) => {
    try{

        const {data, error} = await db.from("sessions").delete().eq("id", session_id).select()
        if(error) {
            throw new SuperBaseException(`Error Occured while deleting session: ${error}`)
        }
        return data
    }catch(error:unknown) {
        throw new SuperBaseException(`Error Occured while deleting session: ${error}`)
    }
}


export const updateSession = async(session_id:string,label:string) => {
    try{
        const {data, error} = await db.from('sessions').update({
            label: label,
            last_active: new Date().toISOString()
        }).eq("id", session_id).select().single()

        if(error) {
            throw new SuperBaseException(`Error Occured while updating session: ${error}`)
        }

        return data
    }catch(error) {
        throw new SuperBaseException(`Error Occured while updating session: ${error}`)
    }
}