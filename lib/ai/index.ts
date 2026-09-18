export {
  streamChatReply,
  generateChatText,
  generateStructuredData,
  transcribeAudio,
  transcribeMediaWindow,
} from "@/lib/ai/service";
export type { ChatMessage, TranscriptionResult } from "@/lib/ai/service";
export { isProviderConfigured, isTranscriptionConfigured, isMediaTranscriptionConfigured } from "@/lib/ai/provider";
