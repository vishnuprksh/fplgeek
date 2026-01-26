
import Database from 'better-sqlite3';
const db = new Database('fpl_data.db');

function getGlobalMax() {
    const query = `
        SELECT 
            m.player_id, 
            m.round,
            m.minutes,
            m.influence,
            m.threat,
            m.ict_index
        FROM matches m
        ORDER BY m.player_id, m.round ASC
    `;
    const allMatches = db.prepare(query).all() as any[];
    const playerHistory = new Map<number, any[]>();
    allMatches.forEach(m => {
        if (!playerHistory.has(m.player_id)) playerHistory.set(m.player_id, []);
        playerHistory.get(m.player_id)?.push(m);
    });

    let globalMax = { wMin: 0, wInf: 0, wThr: 0, wIct: 0 };

    playerHistory.forEach((matches) => {
        let totalWeight = 0, sumMin = 0, sumInf = 0, sumThr = 0, sumIct = 0;
        matches.forEach(m => {
            const weight = m.round;
            sumMin += m.minutes * weight;
            sumInf += m.influence * weight;
            sumThr += m.threat * weight;
            sumIct += m.ict_index * weight;
            totalWeight += weight;
        });
        if (totalWeight > 0) {
            const wMin = sumMin / totalWeight;
            const wInf = sumInf / totalWeight;
            const wThr = sumThr / totalWeight;
            const wIct = sumIct / totalWeight;

            if (wMin > globalMax.wMin) globalMax.wMin = wMin;
            if (wInf > globalMax.wInf) globalMax.wInf = wInf;
            if (wThr > globalMax.wThr) globalMax.wThr = wThr;
            if (wIct > globalMax.wIct) globalMax.wIct = wIct;
        }
    });
    console.log(JSON.stringify(globalMax));
}
getGlobalMax();
