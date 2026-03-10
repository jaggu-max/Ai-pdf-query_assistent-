import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  sources?: Source[];
  externalInfo?: string;
  images?: string[];
  snippets?: string[]; // Cropped images of the answer
}

export interface Source {
  text: string;
  pageNumber: number;
  confidence: number;
  rect?: { x: number; y: number; w: number; h: number };
}

export interface PDFChunk {
  id: string;
  text: string;
  pageNumber: number;
  embedding?: number[];
  heading?: string;
}

export interface PDFFile {
  id: string;
  name: string;
  url: string;
  content: string; // Full text
  pages: string[]; // Base64 images of pages
  chunks: PDFChunk[];
}

export interface Note {
  id: string;
  title: string;
  content: string;
  timestamp: number;
}
