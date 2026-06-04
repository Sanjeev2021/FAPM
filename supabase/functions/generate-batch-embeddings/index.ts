import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

// ─── Table configs ───────────────────────────────────────────────────
interface TableConfig {
  name: string;
  tableName: string;
  primaryKey: string;
}

const TABLES: TableConfig[] = [
  { name: "Supports Master", tableName: "new_00_supports_master", primaryKey: "support_slug" },
  { name: "Supports Variants", tableName: "new_01_supports_variants", primaryKey: "variant_slug" },
  { name: "Planning Kits", tableName: "new_02_planning_kits_media", primaryKey: "id" },
  { name: "Visuels", tableName: "new_03_visuels", primaryKey: "id" },
  { name: "Contacts", tableName: "new_04_contacts", primaryKey: "id" },
];

const COST_PER_MILLION_TOKENS = 0.02; // text-embedding-3-small

// ─── OpenAI batch embedding call ─────────────────────────────────────
async function callOpenAIEmbeddings(
  texts: string[],
  apiKey: string,
): Promise<{ embeddings: number[][]; tokens: number }> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: texts,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return {
    embeddings: data.data.map((d: { embedding: number[] }) => d.embedding),
    tokens: data.usage.total_tokens,
  };
}

// ─── Batch update rows with embeddings ───────────────────────────────
async function batchUpdateEmbeddings(
  adminClient: ReturnType<typeof createClient>,
  tableName: string,
  primaryKey: string,
  updates: Array<{ id: string; embedding: number[] }>,
  concurrency: number,
): Promise<{ success: number; errors: number }> {
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < updates.length; i += concurrency) {
    const chunk = updates.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (update) => {
        const { error } = await adminClient
          .from(tableName)
          .update({ embedding: JSON.stringify(update.embedding) })
          .eq(primaryKey, update.id);
        return !error;
      }),
    );
    successCount += results.filter(Boolean).length;
    errorCount += results.filter((r) => !r).length;
  }

  return { success: successCount, errors: errorCount };
}

// ─── Process one table ───────────────────────────────────────────────
interface TableResult {
  table: string;
  total: number;
  success: number;
  errors: number;
  tokens: number;
  cost: number;
  durationMs: number;
}

async function processTable(
  adminClient: ReturnType<typeof createClient>,
  config: TableConfig,
  openaiApiKey: string,
  force: boolean,
  batchSize: number,
): Promise<TableResult> {
  const start = Date.now();

  // Query all rows with pagination (Supabase defaults to 1000 row limit)
  const PAGE_SIZE = 1000;
  const records: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    let query = adminClient
      .from(config.tableName)
      .select(`${config.primaryKey}, texte_vectorise`)
      .range(offset, offset + PAGE_SIZE - 1);

    if (!force) {
      query = query.is("embedding", null);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`${config.tableName}: ${error.message}`);
    }

    if (!data || data.length === 0) break;
    records.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  if (records.length === 0) {
    return {
      table: config.tableName,
      total: 0,
      success: 0,
      errors: 0,
      tokens: 0,
      cost: 0,
      durationMs: Date.now() - start,
    };
  }

  const texts = records.map((r) => r.texte_vectorise || "");
  let totalTokens = 0;
  const allEmbeddings: number[][] = [];

  // Batch OpenAI calls
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const { embeddings, tokens } = await callOpenAIEmbeddings(batch, openaiApiKey);
    allEmbeddings.push(...embeddings);
    totalTokens += tokens;

    // Rate limiting delay between batches
    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Build updates and save to DB
  const updates = records.map((record, i) => ({
    id: record[config.primaryKey],
    embedding: allEmbeddings[i],
  }));

  const { success, errors: updateErrors } = await batchUpdateEmbeddings(
    adminClient,
    config.tableName,
    config.primaryKey,
    updates,
    50,
  );

  const cost = (totalTokens / 1_000_000) * COST_PER_MILLION_TOKENS;

  return {
    table: config.tableName,
    total: records.length,
    success,
    errors: updateErrors,
    tokens: totalTokens,
    cost,
    durationMs: Date.now() - start,
  };
}

// ─── Main handler ────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // No CORS — admin-only endpoint, not browser-accessible
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 405 });
  }

  try {
    // Auth: service-role key validation (same pattern as process-export-job)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!token || token !== serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized — service-role key required" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured in Supabase secrets" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // Parse input
    const body = await req.json().catch(() => ({}));
    const force: boolean = body.force ?? false;
    const tablesFilter: string[] | undefined = body.tables;
    const batchSize: number = body.batchSize ?? 100;

    // Admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Filter tables
    const tablesToProcess = tablesFilter
      ? TABLES.filter((t) => tablesFilter.includes(t.tableName))
      : TABLES;

    if (tablesToProcess.length === 0) {
      return new Response(
        JSON.stringify({ error: "No matching tables found", validTables: TABLES.map((t) => t.tableName) }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Process each table sequentially
    const startTime = Date.now();
    const results: TableResult[] = [];

    for (const table of tablesToProcess) {
      const result = await processTable(adminClient, table, openaiApiKey, force, batchSize);
      results.push(result);
    }

    const totalDurationMs = Date.now() - startTime;
    const totalTokens = results.reduce((sum, r) => sum + r.tokens, 0);
    const totalCost = results.reduce((sum, r) => sum + r.cost, 0);
    const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

    return new Response(
      JSON.stringify({
        summary: {
          totalRecords: totalSuccess + totalErrors,
          totalSuccess,
          totalErrors,
          totalTokens,
          totalCost: `$${totalCost.toFixed(4)}`,
          durationSeconds: (totalDurationMs / 1000).toFixed(1),
        },
        tables: results.map((r) => ({
          table: r.table,
          records: r.total,
          success: r.success,
          errors: r.errors,
          tokens: r.tokens,
          cost: `$${r.cost.toFixed(4)}`,
          durationMs: r.durationMs,
        })),
        config: { force, batchSize, tables: tablesToProcess.map((t) => t.tableName) },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
