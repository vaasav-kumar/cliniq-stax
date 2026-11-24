import { createWorker } from "tesseract.js";

// Reads text from a photo or scan on this machine. Nothing is sent to an outside service.
// Printed tables read well; handwriting and blurry photos will often fail validation and be reported row by row.
export async function imageToText(image: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
