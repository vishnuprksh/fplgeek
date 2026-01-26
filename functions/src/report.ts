import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { GoogleGenAI } from "@google/genai";

export const generateTeamReport = onCall({ timeoutSeconds: 60, secrets: ["GOOGLE_API_KEY"], cors: true }, async (request) => {
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
    const genAI = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
    // Auth check removed for local dev
    // if (!request.auth) { ... }

    const { players } = request.data;

    if (!players || !Array.isArray(players) || players.length === 0) {
        throw new Error("Invalid players data");
    }

    logger.info(`Generating report for ${players.length} players using gemini-3-flash-preview...`);

    try {
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
            model: "gemini-3-flash-preview",
            contents: [{
                role: "user",
                parts: [{ text: prompt }]
            }],
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        const text = result.text;
        return { report: text };

    } catch (error: any) {
        logger.error("Error generating report:", error);
        throw new Error(`Failed to generate report: ${error.message}`);
    }
});
