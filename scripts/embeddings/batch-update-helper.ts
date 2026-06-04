import { createClient } from '@supabase/supabase-js';

export async function batchUpdateEmbeddings(
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  primaryKey: string,
  updates: Array<{ id: string; embedding: number[] }>,
  concurrency: number = 50
): Promise<{ success: number; errors: number }> {
  let successCount = 0;
  let errorCount = 0;

  const chunks: Array<Array<{ id: string; embedding: number[] }>> = [];
  for (let i = 0; i < updates.length; i += concurrency) {
    chunks.push(updates.slice(i, i + concurrency));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (update) => {
      try {
        const { error } = await supabase
          .from(tableName)
          .update({ embedding: JSON.stringify(update.embedding) })
          .eq(primaryKey, update.id);

        if (error) throw error;
        return { success: true };
      } catch (error) {
        return { success: false };
      }
    });

    const results = await Promise.all(promises);
    successCount += results.filter(r => r.success).length;
    errorCount += results.filter(r => !r.success).length;

    process.stdout.write(`\r  Saved: ${successCount}/${updates.length}`);
  }

  console.log('');
  return { success: successCount, errors: errorCount };
}
