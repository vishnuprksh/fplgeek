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
        const { userSquad, dreamSquad, chipStatus } = req.body;

        if (!userSquad || !dreamSquad) {
            res.status(400).json({ error: "User squad and Dream squad are required" });
            return;
        }

        console.log("Generating transfer suggestions...");

        const prompt = `
        You are an elite Fantasy Premier League (FPL) manager and analyst.
        
        I need you to compare my current team with the AI-optimized "Dream Squad" and provide actionable advice.

        **My Current Squad:**
        ${userSquad.join(", ")}

        **AI Dream Squad (Optimized for next 5 GWs):**
        ${dreamSquad.join(", ")}

        **Context:**
        - Chip Status: ${chipStatus || "Not provided (assume all available if unsure)"}

        **Task:**
        1.  **Compare**: Identify the key differences between my squad and the Dream Squad.
        2.  **Player Analysis**: For players in the Dream Squad that I DON'T own, analyze if I should BUY them.
            -   If a player in my team is underperforming but not in the Dream Squad, should I SELL?
            -   If a player is in my team but not the Dream Squad, should I HOLD?
            -   **Verdict**: Give a strict BUY, SELL, or HOLD verdict for key differences.
        3.  **Chip Strategy**: Based on the overall strength of the Dream Squad vs. my squad, suggest if I should use a chip (Wildcard, Free Hit, Bench Boost, Triple Captain).
            -   Only suggest a chip if there is a massive advantage.

        **Format:**
        -   Use Markdown.
        -   Be concise and direct.
        -   Use emojis for verdicts (✅ BUY, ❌ SELL, ✋ HOLD).
        -   **Chip Recommendation**: Clearly state "Recommended Chip: [Name]" or "None".
        `;

        const result = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{
                role: "user",
                parts: [{ text: prompt }]
            }],
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        const text = result.text;
        res.json({ report: text });

    } catch (error: any) {
        console.error("Error generating suggestions:", error);
        res.status(500).json({ error: `Failed to generate suggestions: ${error.message}` });
    }
});

export default router;
