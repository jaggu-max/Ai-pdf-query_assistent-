import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { PDFChunk } from "../types";
import { cosineSimilarity, getEmbedding } from "./embedding";

const getAI = () => {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key is not set. Please check your environment variables or select a key.");
  return new GoogleGenAI({ apiKey });
};

export async function* streamChat(
  message: string,
  chunks: PDFChunk[],
  pdfImages: string[],
  useGoogle: boolean = false
) {
  const ai = getAI();
  const model = "gemini-3.1-pro-preview";

  // Semantic Search
  const queryEmbedding = await getEmbedding(message);
  const relevantChunks = chunks
    .map(chunk => ({
      ...chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding || [])
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  const contextText = relevantChunks.map(c => `[Page ${c.pageNumber}]: ${c.text}`).join("\n\n");
  const relevantPageNumbers = Array.from(new Set(relevantChunks.map(c => c.pageNumber)));
  
  // Only send images from relevant pages
  const relevantImages = relevantPageNumbers
    .map(page => pdfImages[page - 1])
    .filter(Boolean);
  
  const systemInstruction = `
    You are an expert AI Study Assistant specializing in PDF analysis for students.
    Your primary goal is to read the provided PDF context, extract the correct answer, and provide supporting text and images.

    PDF CONTEXT (Relevant Chunks):
    ${contextText}

    CORE BEHAVIOR:
    1. **Search PDF First**: Always search the provided PDF context and images first before generating any answer.
    2. **Extract Exact Paragraph**: Identify the exact paragraph or section that contains the answer.
    3. **Format Your Response**:
       ### [Experiment Title / Section Title]
       **Correct Answer Text**: [The extracted answer]
       **Page Number Reference**: Page [X-Y]
       **Confidence Score**: [0-100]%

    4. **Visual Snippets**:
       - If the answer includes diagrams, experiment figures, charts, or illustrations, provide a snippet tag.
       - **IMPORTANT**: Ensure the vertical range (y1 to y2) is generous (at least 150-250 units) to capture full diagrams or procedures.
       - Format: [SNIPPET: page=X, y1=Y1, y2=Y2]

    5. **If No Answer Exists in the PDF**:
       - If the answer is NOT in the PDF context, you MUST start your response with:
         "**Answer not found in uploaded document.**"
       - Then, create a new section:
         "### Additional Knowledge (Google Search)"
       - Fetch reliable information using the Google Search tool and clearly label it as external information.

    STUDENT-FRIENDLY FEATURES:
    - Detect experiment headings like "Experiment 1", "Experiment 2", etc.
    - Automatically show the experiment title before the answer.
    - Extract definitions, explanations, diagrams, and procedures correctly.

    TONE: Professional, technical, and output-oriented.
  `;

  const tools = useGoogle ? [{ googleSearch: {} }] : [];

  const response = await ai.models.generateContentStream({
    model,
    contents: [
      {
        role: "user",
        parts: [
          ...relevantImages.map(img => ({
            inlineData: {
              mimeType: "image/jpeg",
              data: img.split(",")[1]
            }
          })),
          { text: message }
        ]
      }
    ],
    config: {
      systemInstruction,
      tools,
    },
  });

  for await (const chunk of response) {
    yield chunk.text;
  }
}

export async function summarizePDF(content: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Summarize the following PDF content in a professional way, highlighting key points and main takeaways:\n\n${content}`,
  });
  return response.text;
}

export async function generateCitation(text: string, sourceName: string) {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Generate a formal APA, MLA, and Chicago style citation for this source: "${sourceName}" based on this snippet: "${text}"`,
  });
  return response.text;
}
