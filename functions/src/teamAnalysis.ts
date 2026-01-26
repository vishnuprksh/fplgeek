import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { GoogleGenAI } from "@google/genai";

export const generateTeamAnalysis = onCall({ timeoutSeconds: 60, secrets: ["GOOGLE_API_KEY"], cors: true }, async (request) => {
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "";
    const genAI = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
    // Auth check removed for local dev
    // if (!request.auth) { ... }

    const { teamName, recentPerformance, strengths, weaknesses } = request.data;

    if (!teamName) {
        throw new Error("Team name is required");
    }

    logger.info(`Generating analysis for team ${teamName}...`);

    try {
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
            model: "gemini-3-flash-preview",
            contents: [{
                role: "user",
                parts: [{ text: prompt }]
            }]
        });

        const text = result.text;
        return { report: text };

    } catch (error: any) {
        logger.error("Error generating analysis:", error);
        throw new Error(`Failed to generate analysis: ${error.message}`);
    }
});
