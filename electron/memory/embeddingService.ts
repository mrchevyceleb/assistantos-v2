/**
 * Embedding Service
 *
 * Generates embeddings using OpenAI's text-embedding-3-small model.
 * Used for semantic search in the memory system.
 */

import OpenAI from 'openai'

// OpenAI client instance (initialized when API key is set)
let openaiClient: OpenAI | null = null

// Model configuration
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

/**
 * Initialize the OpenAI client with an API key
 */
export function initializeEmbeddings(apiKey: string): void {
  if (apiKey) {
    openaiClient = new OpenAI({ apiKey })
  } else {
    openaiClient = null
  }
}

/**
 * Check if embeddings are available (OpenAI client initialized)
 */
export function isEmbeddingsAvailable(): boolean {
  return openaiClient !== null
}

/**
 * Generate an embedding for a single text
 * Returns null if OpenAI client not initialized or on error
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!openaiClient) {
    return null
  }

  try {
    const response = await openaiClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      dimensions: EMBEDDING_DIMENSIONS,
    })

    return response.data[0].embedding
  } catch (error) {
    console.error('Failed to generate embedding:', error)
    return null
  }
}

/**
 * Generate embeddings for multiple texts in a single API call
 * More efficient than calling generateEmbedding multiple times
 * Returns array of embeddings (null for any that failed)
 */
export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  if (!openaiClient || texts.length === 0) {
    return texts.map(() => null)
  }

  try {
    const response = await openaiClient.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    })

    // Map results back to input order
    const embeddings: (number[] | null)[] = texts.map(() => null)
    for (const item of response.data) {
      embeddings[item.index] = item.embedding
    }

    return embeddings
  } catch (error) {
    console.error('Failed to generate embeddings:', error)
    return texts.map(() => null)
  }
}

/**
 * Format embedding array for Supabase pgvector
 * pgvector expects format: '[0.1, 0.2, ...]'
 */
export function formatEmbeddingForSupabase(embedding: number[]): string {
  return `[${embedding.join(',')}]`
}
