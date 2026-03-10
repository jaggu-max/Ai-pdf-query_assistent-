/// <reference types="vite/client" />

declare module "*?url" {
  const content: string;
  export default content;
}

interface Window {
  aistudio?: {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  };
}
