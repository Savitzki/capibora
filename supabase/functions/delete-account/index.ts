import { createDeleteAccountHandler } from "./service.ts";

const required = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const supabaseURL = required("SUPABASE_URL").replace(/\/+$/, "");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
Deno.serve(createDeleteAccountHandler(supabaseURL, serviceKey));
