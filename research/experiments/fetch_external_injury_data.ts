
import fetch from 'node-fetch';

// Updated based on user input
const BASE_REPO = "https://raw.githubusercontent.com/olbauday/FPL-Core-Insights/main/data";

async function checkExternalData() {
    // User provided: 2025-2026 format, FPL-Core-Insights repo
    const variants = [
        "2025-2026/By%20Gameweek/GW5/playerstats.csv",
        "2025-2026/By%20Gameweek/GW10/playerstats.csv",
    ];

    console.log("Checking variants (FPL-Core-Insights)...");

    for (const path of variants) {
        const url = `${BASE_REPO}/${path}`;
        try {
            const response = await fetch(url);
            if (response.ok) {
                console.log(`\n✅ Success with: ${path}`);
                const text = await response.text();
                const lines = text.split('\n');
                console.log(`Header: ${lines[0].substring(0, 100)}...`);

                if (lines[0].includes('status')) {
                    console.log("   -> Contains 'status' column.");

                    // Find a line with status != 'a'
                    // CSV structure varies, finding 'i' or 'd' in comma separated
                    const inj = lines.find(l => l.match(/,d,|.i,/));
                    if (inj) {
                        console.log("   -> Found non-available player sample:");
                        console.log("      " + inj.substring(0, 100) + "...");
                    }
                }

                return;
            } else {
                console.log(`❌ Failed: ${path} (${response.status})`);
            }
        } catch (err) {
            console.error(`Error fetching ${url}:`, err);
        }
    }
}

checkExternalData();
