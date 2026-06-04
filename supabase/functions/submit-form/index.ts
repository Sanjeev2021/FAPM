import { createClient } from "npm:@supabase/supabase-js@2.76.1";
import { getCorsHeaders } from "../_shared/clients.ts";

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { type, name, email, company, message, phone } = body;

    // Validate required fields
    if (!type || !name || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, name, email" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    if (!["demo", "contact"].includes(type)) {
      return new Response(
        JSON.stringify({ error: "Invalid type. Must be 'demo' or 'contact'" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    // Use service role to insert (RLS allows anon insert, but EF uses service role for reliability)
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await adminClient.from("form_submissions").insert({
      type,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      company: company?.trim() || null,
      message: message?.trim() || null,
      phone: phone?.trim() || null,
    });

    if (error) {
      console.error("Insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to save submission" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("submit-form error:", err);
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }
});
