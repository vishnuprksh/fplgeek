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
        const { teamName, recentPerformance, strengths, weaknesses } = req.body;

        if (!teamName) {
            res.status(400).json({ error: "Team name is required" });
            return;
        }

        console.log(`Generating analysis for team ${teamName}...`);

        const prompt = `
        You are a football analyst. Create a detailed strength and weakness report for the team "${teamName}".
        
        Context:
        - Recent Performance: ${recentPerformance}
        - Key Strengths: ${strengths}
        - Key Weaknesses: ${weaknesses}
        
        Please provide a concise but insightful analysis suitable for a fantasy premier league manager.
        Structure the report with:
        1. Executive Summary
        2. Attack Analysis
        3. Defense Analysis
        4. Key Player Recommendations
        `;

        const result = await genAI.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{
                role: "user",
                parts: [{ text: prompt }]
            }]
        });

        const text = result.text;
        res.json({ report: text });

    } catch (error: any) {
        console.error("Error generating analysis:", error);
        res.status(500).json({ error: `Failed to generate analysis: ${error.message}` });
    }
});

export default router;
