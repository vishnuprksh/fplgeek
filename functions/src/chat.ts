import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { GoogleGenAI } from "@google/genai";

export const startChat = onCall({ timeoutSeconds: 60, secrets: ["GOOGLE_API_KEY"], cors: true }, async (request) => {
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
    const genAI = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
    // Auth check removed for local dev
    // if (!request.auth) { ... }

    const { history, message, systemInstruction } = request.data;

    if (!message) {
        throw new Error("Message is required");
    }

    logger.info("Starting chat interaction...");

    try {
        // Convert history to format expected by @google/genai if needed
        // Assuming history comes in as { role: string, parts: { text: string }[] }[]

        const contents = history ? [...history] : [];
        contents.push({
            role: "user",
            parts: [{ text: message }]
        });

        const result = await genAI.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
            }
        });

        const text = result.text;
        return { response: text };

    } catch (error: any) {
        logger.error("Error in chat:", error);
        throw new Error(`Failed to process chat: ${error.message}`);
    }
});
