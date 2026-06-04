import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.76.1";

export interface Clients {
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
  user: { id: string; email: string };
  orgId: string;
}

const ALLOWED_ORIGINS = [
  "https://app.flaix.io",
  "https://flaix.ai",
  "https://www.flaix.ai",
  "https://admin.flaix.ai",
  "https://flaix-agent.vercel.app",
  ...(Deno.env.get("CORS_EXTRA_ORIGINS")?.split(",").filter(Boolean) ?? []),
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:3001",
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Expose-Headers": "X-Conversation-Id",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/** Lightweight auth — validates JWT only, no org/profile lookup. */
export async function validateAuth(req: Request): Promise<{ id: string; email: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) throw new Error("Missing authorization");

  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");

  return { id: user.id, email: user.email! };
}

export async function createClients(req: Request): Promise<Clients> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Admin client — bypasses RLS, used for writes
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Extract JWT from Authorization header
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) throw new Error("Missing authorization");

  // Validate user via admin client
  const {
    data: { user },
    error,
  } = await adminClient.auth.getUser(token);
  if (error || !user) throw new Error("Unauthorized");

  // Get org_id from profile
  const { data: profile } = await adminClient
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) throw new Error("No organization");

  // User client — JWT-scoped, for RLS-protected reads
  const userClient = createClient(
    supabaseUrl,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );

  return {
    userClient,
    adminClient,
    user: { id: user.id, email: user.email! },
    orgId: profile.organization_id,
  };
}
