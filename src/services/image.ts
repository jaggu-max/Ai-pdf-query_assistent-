export function cropImage(base64: string, rect: { y1: number, y2: number }): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not get canvas context"));
          return;
        }

        const width = img.width;
        const height = img.height;
        
        // Normalize coordinates (0-1000) to actual pixel values
        const yStart = (rect.y1 / 1000) * height;
        const yEnd = (rect.y2 / 1000) * height;
        
        // Ensure yStart < yEnd and within bounds
        const actualYStart = Math.max(0, Math.min(yStart, yEnd));
        const actualYEnd = Math.min(height, Math.max(yStart, yEnd));
        const cropHeight = actualYEnd - actualYStart;
        
        if (cropHeight <= 0) {
          resolve(base64); // Return original if crop is invalid
          return;
        }

        canvas.width = width;
        canvas.height = cropHeight;
        
        ctx.drawImage(
          img, 
          0, actualYStart, width, cropHeight, // Source
          0, 0, width, cropHeight             // Destination
        );
        
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Failed to load image for cropping"));
    img.src = base64;
  });
}
