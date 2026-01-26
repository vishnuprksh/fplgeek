import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';

const dbPath = path.resolve(process.cwd(), "public/data/fpl.sqlite");
const db = new Database(dbPath);

async function generateTicker() {
    console.log("🗓️ Generating Fixture Ticker Analysis...");

    // 1. Get Current Event
    const eventsData = db.prepare("SELECT data FROM events WHERE id = 'events'").get();
    const events = JSON.parse(eventsData.data);
    const currentEvent = events.find((e: any) => e.is_current).id;
    const nextEvent = currentEvent + 1;
    console.log(`Current Week: GW${currentEvent}. Analyzing from GW${nextEvent}...`);

    // 2. Load Team Stats
    const teamAnalysis = db.prepare("SELECT data FROM team_analysis").all().map((r: any) => JSON.parse(r.data));
    const teams = teamAnalysis.reduce((acc: any, t: any) => {
        acc[t.id] = t;
        return acc;
    }, {});

    // 3. Load Fixtures
    const fixtures = db.prepare("SELECT data FROM fixtures").all().map((r: any) => JSON.parse(r.data));

    const weeksToAnalyze = 5;
    const gws = Array.from({ length: weeksToAnalyze }, (_, i) => nextEvent + i);

    const calculateTicker = (metric: 'attack' | 'defense') => {
        const results: any[] = [];

        Object.values(teams).forEach((team: any) => {
            let totalScore = 0;
            const matches: any[] = [];

            gws.forEach(gw => {
                const match = fixtures.find((f: any) => f.event === gw && (f.team_h === team.id || f.team_a === team.id));
                if (match) {
                    const isHome = match.team_h === team.id;
                    const opponentId = isHome ? match.team_a : match.team_h;
                    const opponent = teams[opponentId];
                    let score = 0;

                    if (opponent) {
                        if (metric === 'attack') {
                            score = isHome ? (team.homeGoalsScored + opponent.awayGoalsConceded) : (team.awayGoalsScored + opponent.homeGoalsConceded);
                        } else {
                            score = isHome ? (team.homeGoalsConceded + opponent.awayGoalsScored) : (team.awayGoalsConceded + opponent.homeGoalsScored);
                        }
                        totalScore += score;
                        matches.push({ opponent: opponent.short_name, isHome, score });
                    }
                } else {
                    matches.push(null);
                }
            });

            results.push({ team: team.name, short: team.short_name, totalScore, matches });
        });

        // Sort: Attack (Highest First), Defense (Lowest First)
        return results.sort((a, b) => metric === 'attack' ? b.totalScore - a.totalScore : a.totalScore - b.totalScore);
    };

    const attackTicker = calculateTicker('attack');
    const defenseTicker = calculateTicker('defense');

    // 4. Generate Report
    let report = `# 🗓️ Fixture Analysis Report (Next 5 Weeks)\n\n`;
    report += `Analysis based on current team performance (Goals Scored/Conceded).\n\n`;

    report += `## 🔥 Best Attacking Fixtures (GW${gws[0]} - GW${gws[gws.length - 1]})\n`;
    report += `*Predicting goal potential based on team attack vs opponent defense.*\n\n`;
    report += `| Team | Total Potential | GW${gws[0]} | GW${gws[1]} | GW${gws[2]} | GW${gws[3]} | GW${gws[4]} |\n`;
    report += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    attackTicker.slice(0, 10).forEach(t => {
        const m = t.matches.map((m: any) => m ? `${m.opponent}${m.isHome ? '(H)' : '(A)'}` : '-');
        report += `| **${t.short}** | ${t.totalScore.toFixed(1)} | ${m[0]} | ${m[1]} | ${m[2]} | ${m[3]} | ${m[4]} |\n`;
    });

    report += `\n## 🛡️ Best Defensive Fixtures (GW${gws[0]} - GW${gws[gws.length - 1]})\n`;
    report += `*Predicting clean sheet potential (Lower score is better).*\n\n`;
    report += `| Team | Cumulative Risk | GW${gws[0]} | GW${gws[1]} | GW${gws[2]} | GW${gws[3]} | GW${gws[4]} |\n`;
    report += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    defenseTicker.slice(0, 10).forEach(t => {
        const m = t.matches.map((m: any) => m ? `${m.opponent}${m.isHome ? '(H)' : '(A)'}` : '-');
        report += `| **${t.short}** | ${t.totalScore.toFixed(1)} | ${m[0]} | ${m[1]} | ${m[2]} | ${m[3]} | ${m[4]} |\n`;
    });

    console.log(report);
}

generateTicker().catch(console.error);
