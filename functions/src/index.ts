import { onSchedule, ScheduledEvent } from "firebase-functions/v2/scheduler";
import { onRequest, Request } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { Response } from "express";
import { ingestData } from "./ingest";
import { FirestoreRepository } from "./db/firestoreRepository";
import { calculateSmartValues } from "./analysis";
import { generateProjections } from "./projections";
import "./init";

import { ingestHistoricalSnapshots } from "./ingestHistorical";

// Scheduled job: Runs every day at 3:00 AM
export const dailyUpdate = onSchedule("every day 03:00", async (event: ScheduledEvent) => {
    logger.info("Starting Daily Update...");
    await ingestData(new FirestoreRepository(), logger);
    await calculateSmartValues();
    await generateProjections();
    logger.info("Daily Update Complete.");
});

// Scheduled job: Weekly for Historical Snapshots (e.g., Tuesday 4AM)
export const weeklyHistoricalUpdate = onSchedule("every tuesday 04:00", async (event: ScheduledEvent) => {
    logger.info("Starting Weekly Historical Update...");
    await ingestHistoricalSnapshots();
    logger.info("Weekly Historical Update Complete.");
});

// HTTP Trigger for manual testing
export const manualUpdate = onRequest({ timeoutSeconds: 300 }, async (req: Request, res: Response) => {
    try {
        logger.info("Starting Manual Update...");
        await ingestData(new FirestoreRepository(), logger);
        await calculateSmartValues();
        res.send("Update Complete");
    } catch (e: any) { // Type as any or Error to access message
        logger.error(e);
        res.status(500).send(`Error: ${e.message}`);
    }
});

export const manualHistoricalUpdate = onRequest({ timeoutSeconds: 540 }, async (req: Request, res: Response) => {
    try {
        await ingestHistoricalSnapshots();
        res.send("Historical Snapshots Synced.");
    } catch (e: any) {
        logger.error(e);
        res.status(500).send(`Error: ${e.message}`);
    }
});

// Proxy for user-specific API calls (e.g. team details, picks)
export const apiProxy = onRequest({ timeoutSeconds: 30 }, async (req: Request, res: Response) => {
    // Strip '/api' prefix if present in the function path trigger, 
    // but typically rewrite keeps the path.
    // If incoming request is /api/entry/123, we want forwarding to https://.../api/entry/123

    // Check if we need to remove the /api prefix or if the rewrite handles it.
    // Usually req.path contains the path.
    const targetUrl = `https://fantasy.premierleague.com${req.url}`;

    try {
        const fetchRes = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json'
            },
            body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
        });

        if (!fetchRes.ok) {
            res.status(fetchRes.status).send(await fetchRes.text());
            return;
        }

        const data = await fetchRes.json();
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.json(data);
    } catch (error: any) {
        logger.error("Proxy error", error);
        res.status(500).send(error.message);
    }
});

export { generateTeamReport } from "./report";
export { startChat } from "./chat";
export { generateTeamAnalysis } from "./teamAnalysis";
export { generateTransferSuggestions } from "./suggestions";
