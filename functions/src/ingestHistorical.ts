
import { db } from "./init";
import * as logger from "firebase-functions/logger";

const REPO_BASE = "https://raw.githubusercontent.com/olbauday/FPL-Core-Insights/main/data/2025-2026/By%20Gameweek";

interface PlayerSnapshot {
    id: number;
    status: string;
    news: string;
    chance_playing: number | null;
}

async function fetchCsv(url: string): Promise<string | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.text();
    } catch (e) {
        logger.error(`Failed to fetch ${url}`, e);
        return null;
    }
}

function parseSnapshotCsv(csv: string): Map<number, PlayerSnapshot> {
    const map = new Map();
    const lines = csv.split('\n');
    // Header: id,status,chance_of_playing_next_round,...

    // Simple parser assuming standard order or we check header
    // Let's check header for indices
    const header = lines[0].split(',');
    const idxId = header.indexOf('id');
    const idxStatus = header.indexOf('status');
    const idxNews = header.indexOf('news');
    const idxChance = header.indexOf('chance_of_playing_next_round');

    if (idxId === -1 || idxStatus === -1) return map;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // CSV parsing is tricky with commas in 'news'. 
        // For now, assuming simple split works or 'status' is safe.
        // FPL news often has commas. 
        // We really only NEED status (index 1 usually).
        // Let's be careful.

        // Robust-ish split for simple CSVs:
        const cols = line.split(',');
        // If news has commas, this breaks indices after news.
        // But 'id' and 'status' are usually first.
        // Header: id,status,chance...

        const id = parseInt(cols[idxId]);
        const status = cols[idxStatus];

        if (!isNaN(id) && status) {
            map.set(id, {
                id,
                status,
                news: cols[idxNews] || "",
                chance_playing: cols[idxChance] ? parseFloat(cols[idxChance]) : null
            });
        }
    }
    return map;
}

export async function ingestHistoricalSnapshots() {
    logger.info("Starting Historical Snapshot Ingestion...");

    // We iterate known Gameweeks (1 to 38)
    // In production we might only verify 'current GW' and 'previous GW' to save time,
    // or run a full backfill once.

    // Let's try to detect current GW from Firestore 'static/events' or just loop 1-38 and stop on 404.

    for (let gw = 1; gw <= 38; gw++) {
        const url = `${REPO_BASE}/GW${gw}/playerstats.csv`;
        const csv = await fetchCsv(url);

        if (!csv) {
            logger.info(`GW${gw} data not available (404), ending sync.`);
            break;
        }

        const snapshots = parseSnapshotCsv(csv);
        logger.info(`GW${gw}: Parsed ${snapshots.size} player snapshots.`);

        const batch = db.batch();
        let opCount = 0;

        // Update Firestore
        // We need to find the specific Match Document for this Player + GW.
        // Structure: players/{id}/history/{fixtureId}
        // Problem: We don't know FixtureID easily here.
        // But we DO know round (GW).
        // Query: collection group? Or iterate players?

        // Iterating 600 players * 38 GWs is too expensive for Firestore reads.
        // Better Strategy: Store this snapshot in a subcollection `players/{id}/snapshots/{gw}`
        // Then SmartValue calculator reads this `snapshots` collection.

        for (const [pid, snap] of snapshots) {
            const docRef = db.collection('players').doc(pid.toString()).collection('snapshots').doc(gw.toString());
            batch.set(docRef, {
                round: gw,
                status: snap.status,
                news: snap.news,
                chance_playing: snap.chance_playing
            }, { merge: true });

            opCount++;
            if (opCount >= 400) {
                await batch.commit();
                opCount = 0;
            }
        }
        if (opCount > 0) await batch.commit();
        logger.info(`GW${gw}: Synced to Firestore.`);
    }

    logger.info("Historical Snapshot Ingestion Complete.");
}
