import { Router, Request, Response } from 'express';
import { GoogleGenAI } from "@google/genai";

const router = Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
        if (!GOOGLE_API_KEY) {
            console.error("GOOGLE_API_KEY is missing");
            res.status(500).json({ error: "Server configuration error" });
            return;
        }

        const genAI = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
        const { players } = req.body;

        if (!players || !Array.isArray(players) || players.length === 0) {
            res.status(400).json({ error: "Invalid players data" });
            return;
        }

        console.log(`Generating report for ${players.length} players using gemini-2.0-flash...`);

        const prompt = `
        You are an expert Fantasy Premier League (FPL) analyst. I need a "Team Health Report" for the following squad:
        
        Squad: ${players.join(", ")}

        Using Google Search, find the latest news, injury updates, press conference quotes, and form data for these players.
        
        Generate a report with the following structure:
        
        ### 🧤 Goalkeepers
        - Analysis of the GK(s).
        
        ### 🛡️ Defense
        - Overall defensive health.
        - Individual analysis for key defenders (Form, Fitness, Rotation Risk).
        
        ### 👟 Midfield
        - Overall midfield health.
        - Individual analysis for key midfielders (Form, Fitness, Rotation Risk).
        
        ### ⚽ Attack
        - Overall attack health.
        - Individual analysis for key forwards (Form, Fitness, Rotation Risk).

        **Important:**
        - Highlight any **INJURIES** or **DOUBTS** clearly with ⚠️.
        - Highlight **ROTATION RISKS** with 🔄.
        - Keep it concise and easy to read.
        - Use bullet points.
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
        console.error("Error generating report:", error);
        res.status(500).json({ error: `Failed to generate report: ${error.message}` });
    }
});

export default router;
