import { IDatabaseRepository } from "./repository";
import { db } from "../init";
import { Team, Event, ElementType } from "../types";

export class FirestoreRepository implements IDatabaseRepository {
    async batchWritePlayers(players: any[]): Promise<void> {
        let batch = db.batch();
        let count = 0;

        for (const p of players) {
            const playerRef = db.collection('players').doc(p.id.toString());
            batch.set(playerRef, {
                id: p.id,
                code: p.code,
                web_name: p.web_name,
                element_type: p.element_type,
                team: p.team,
                now_cost: p.now_cost,
                first_name: p.first_name,
                second_name: p.second_name,
                selected_by_percent: p.selected_by_percent,
                total_points: p.total_points,
            }, { merge: true });

            count++;
            if (count % 400 === 0) {
                await batch.commit();
                batch = db.batch();
            }
        }
        await batch.commit();
    }

    async saveStaticData(teams: Team[], events: Event[], elementTypes: ElementType[]): Promise<void> {
        const metaBatch = db.batch();
        metaBatch.set(db.collection('static').doc('teams'), { data: teams });
        metaBatch.set(db.collection('static').doc('events'), { data: events });
        metaBatch.set(db.collection('static').doc('element_types'), { data: elementTypes });
        await metaBatch.commit();
    }

    async savePlayerHistory(playerId: number, history: any[]): Promise<void> {
        const playerRef = db.collection('master_players').doc(playerId.toString());

        // 1. Save denormalized history to parent doc for efficient analysis
        // We only save essential fields to keep document size down if needed, 
        // but for <50 items, full object is fine.
        await playerRef.set({ history: history }, { merge: true });

        // 2. Save granular history (Optional, but good for specific queries)
        const historyBatch = db.batch();
        let historyCount = 0;

        for (const m of history) {
            if (m.round > 38) continue;

            const matchRef = playerRef.collection('history').doc(m.fixture.toString());
            historyBatch.set(matchRef, {
                ...m,
                was_home: m.was_home,
                influence: parseFloat(m.influence),
                creativity: parseFloat(m.creativity),
                threat: parseFloat(m.threat),
                ict_index: parseFloat(m.ict_index),
                manufacturer_id: playerId
            });
            historyCount++;
        }

        if (historyCount > 0) {
            await historyBatch.commit();
        }
    }

    async saveFixtures(fixtures: any[]): Promise<void> {
        let batch = db.batch();
        let count = 0;
        for (const f of fixtures) {
            const ref = db.collection('fixtures').doc(f.id.toString());
            batch.set(ref, f);
            count++;
            if (count % 400 === 0) {
                await batch.commit();
                batch = db.batch();
            }
        }
        await batch.commit();
    }
}
