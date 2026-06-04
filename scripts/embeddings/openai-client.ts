import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '../../.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ Missing OpenAI API key');
  process.exit(1);
}

export interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIClient {
  private apiKey: string;
  private model: string = 'text-embedding-3-small';
  private apiUrl: string = 'https://api.openai.com/v1/embeddings';

  constructor(apiKey: string = OPENAI_API_KEY!) {
    this.apiKey = apiKey;
  }

  async createEmbeddings(texts: string[]): Promise<EmbeddingResponse> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        encoding_format: 'float',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  async createEmbedding(text: string): Promise<number[]> {
    const response = await this.createEmbeddings([text]);
    return response.data[0].embedding;
  }

  async createEmbeddingsBatch(
    texts: string[],
    batchSize: number = 100,
    onProgress?: (completed: number, total: number, tokensUsed: number) => void
  ): Promise<number[][]> {
    const embeddings: number[][] = [];
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const response = await this.createEmbeddings(batch);

      embeddings.push(...response.data.map(d => d.embedding));
      totalTokens += response.usage.total_tokens;

      if (onProgress) {
        onProgress(Math.min(i + batchSize, texts.length), texts.length, totalTokens);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return embeddings;
  }

  estimateCost(tokens: number): number {
    const costPerMillionTokens = 0.02;
    return (tokens / 1_000_000) * costPerMillionTokens;
  }
}

export const openai = new OpenAIClient();
