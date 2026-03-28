-- 1. Fix RLS policies to allow INSERTs (Adding WITH CHECK)
ALTER POLICY "Individual chat_log access" ON "public"."chat_log"
  WITH CHECK (EXISTS (SELECT 1 FROM "public"."sessions" WHERE "id" = "chat_log"."session_id" AND "user_id" = "auth"."uid"()));

ALTER POLICY "Individual ingest_log access" ON "public"."ingest_log"
  WITH CHECK (EXISTS (SELECT 1 FROM "public"."sessions" WHERE "id" = "ingest_log"."session_id" AND "user_id" = "auth"."uid"()));

ALTER POLICY "Individual profile access" ON "public"."profiles"
  WITH CHECK ("auth"."uid"() = "id");

ALTER POLICY "Individual session access" ON "public"."sessions"
  WITH CHECK ("auth"."uid"() = "user_id");

-- 2. Revoke overly permissive 'anon' grants
REVOKE ALL ON TABLE "public"."chat_log" FROM "anon";
REVOKE ALL ON TABLE "public"."ingest_log" FROM "anon";
REVOKE ALL ON TABLE "public"."profiles" FROM "anon";
REVOKE ALL ON TABLE "public"."sessions" FROM "anon";

REVOKE ALL ON FUNCTION "public"."get_paginated_chat_v1" FROM "anon";
REVOKE ALL ON FUNCTION "public"."handle_new_user" FROM "anon";

-- 3. Grant specific permissions to 'authenticated' users (Least Privilege)
GRANT SELECT, INSERT, DELETE ON TABLE "public"."chat_log" TO "authenticated";
GRANT SELECT, INSERT ON TABLE "public"."ingest_log" TO "authenticated";
GRANT SELECT, UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."sessions" TO "authenticated";