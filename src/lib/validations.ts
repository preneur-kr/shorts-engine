import { z } from 'zod';

// --- Boundary Validation (Zod) ---
// Define the expected Discord Webhook payload structure.
export const discordWebhookSchema = z.object({
  content: z.string().min(1, "Message content is required"),
  author: z.object({
    username: z.string().optional(),
    id: z.string().optional(),
  }).optional(),
});

// URL Extraction regex (Simple version for Instagram/TikTok/YouTube)
export const videoUrlPattern = /https?:\/\/(www\.)?(instagram\.com|tiktok\.com|youtube\.com|youtu\.be)\/[^\s]+/g;

export type DiscordWebhook = z.infer<typeof discordWebhookSchema>;
