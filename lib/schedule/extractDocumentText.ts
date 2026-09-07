import "server-only";
import { getDocumentProxy, extractText } from "unpdf";
import mammoth from "mammoth";

// Pulling plain text out of an uploaded timetable document.
//
// Both libraries are already dependencies — unpdf powers the Torah shiur
// extractor (app/api/torah/extract) and mammoth is used by the summaries
// editor — so this is reuse, not new surface area. Images do not come through
// here at all: those go straight to the vision model, which reads a grid far
// better than any text extraction of a scan would.

/**
 * Text from a PDF, Word document, or plain-text upload.
 *
 * Returns null when the format isn't one we can read, so the caller can say
 * so precisely instead of sending an empty prompt to the model and getting
 * back a confidently empty schedule.
 */
export async function extractDocumentText(
  bytes: Uint8Array,
  mimeType: string,
  fileName: string
): Promise<string | null> {
  const name = fileName.toLowerCase();

  try {
    if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
      const pdf = await getDocumentProxy(bytes);
      const { text } = await extractText(pdf, { mergePages: true });
      return text.trim() || null;
    }

    if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx")
    ) {
      // Buffer, not Uint8Array: mammoth's Node entry point reads
      // `arrayBuffer` off a Buffer and rejects a bare typed array.
      const { value } = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      return value.trim() || null;
    }

    if (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      name.endsWith(".txt") ||
      name.endsWith(".csv") ||
      name.endsWith(".md")
    ) {
      return new TextDecoder().decode(bytes).trim() || null;
    }
  } catch {
    // A corrupt or password-protected file is a "we could not read this",
    // which is exactly what null already means to the caller.
    return null;
  }

  return null;
}
