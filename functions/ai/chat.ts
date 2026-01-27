import { Router, Request, Response } from 'express';
import { GoogleGenAI } from "@google/genai";

const router = Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
        if (!GOOGLE_API_KEY) {
            res.status(500).json({ error: "Server configuration error" });
            return;
        }

        const genAI = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
        const { history, message, systemInstruction } = req.body;

        if (!message) {
            res.status(400).json({ error: "Message is required" });
            return;
        }

        console.log("Starting chat interaction...");

        // Convert history to format expected by @google/genai if needed
        const contents = history ? [...history] : [];
        contents.push({
            role: "user",
            parts: [{ text: message }]
        });

        const result = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
            }
        });

        const text = result.text;
        res.json({ response: text });

    } catch (error: any) {
        console.error("Error in chat:", error);
        res.status(500).json({ error: `Failed to process chat: ${error.message}` });
    }
});

export default router;
