import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { env } from "../conf/conf.ts";


const key  =  env.ENV === "dev" ? env.SUPERBASE_DEV_KEY : env.SUPERBASE_KEY
export const db = createClient<Database>(env.SUPERBASE_URL, key)
