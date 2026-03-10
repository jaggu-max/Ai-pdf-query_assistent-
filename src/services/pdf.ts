import * as pdfjs from "pdfjs-dist";
import { PDFChunk } from "../types";
import { getEmbedding } from "./embedding";

// Initialize pdfjs worker using a local URL for better reliability in Vite
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function processPDF(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = "";
  const pageImages: string[] = [];
  const chunks: PDFChunk[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    fullText += `Page ${i}: ${pageText}\n\n`;
    
    // Render page to canvas to get image for multimodal AI
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport, canvas: canvas as any }).promise;
      pageImages.push(canvas.toDataURL("image/jpeg", 0.8));
    }

    // Chunking logic: 300-500 words
    // For simplicity, we'll chunk by page first, then split if too large
    const words = pageText.split(/\s+/);
    const chunkSize = 400;
    
    // Simple heading detection: first line if it's short and capitalized
    const lines = pageText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const potentialHeading = lines[0]?.length < 100 ? lines[0] : undefined;

    for (let j = 0; j < words.length; j += chunkSize) {
      const chunkText = words.slice(j, j + chunkSize).join(" ");
      if (chunkText.trim().length > 10) {
        const embedding = await getEmbedding(chunkText);
        chunks.push({
          id: `${i}-${j}`,
          text: chunkText,
          pageNumber: i,
          embedding,
          heading: potentialHeading
        });
      }
    }
  }
  
  return {
    text: fullText,
    images: pageImages,
    numPages: pdf.numPages,
    chunks
  };
}
