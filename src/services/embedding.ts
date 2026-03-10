import { GoogleGenAI } from "@google/genai";

const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

export async function getEmbedding(text: string): Promise<number[]> {
  const ai = getAI();
  const result = await ai.models.embedContent({
    model: "gemini-embedding-2-preview",
    contents: [text],
  });
  return result.embeddings[0].values;
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    mA += vecA[i] * vecA[i];
    mB += vecB[i] * vecB[i];
  }
  mA = Math.sqrt(mA);
  mB = Math.sqrt(mB);
  return dotProduct / (mA * mB);
}
