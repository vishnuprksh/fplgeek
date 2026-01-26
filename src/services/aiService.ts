// aiService.ts - Updated to use local server proxy
// We now call our local server endpoints prefixed with /ai-api (proxied by Nginx)

export type AnalysisType = 'general' | 'player' | 'buy-hold-sell';

const API_BASE = '/ai-api';

export const aiService = {
    async generateTeamReport(teamName: string, recentPerformance: string, strengths: string, weaknesses: string): Promise<string> {
        try {
            const response = await fetch(`${API_BASE}/analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamName, recentPerformance, strengths, weaknesses })
            });

            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
            const data = await response.json();
            return data.report;
        } catch (error) {
            console.error("Error generating report:", error);
            throw error;
        }
    },

    async startChat(teamName: string, recentPerformance: string, strengths: string, weaknesses: string, type: AnalysisType = 'general') {
        try {
            let systemInstruction = "";

            if (type === 'player') {
                systemInstruction = `You are a detailed scout and performance analyst. I want you to analyze the players in my team "${teamName}" individually.
            
Context:
- Recent Performance: ${recentPerformance}
- Key Strengths: ${strengths}
- Key Weaknesses: ${weaknesses}

Focus heavily on individual player form, underlying stats (xG, xA), and upcoming fixture difficulty for specific players. 
Provide a player-by-player breakdown for key assets. Avoid generic team-level advice unless it relates to a specific player's role.`;

            } else if (type === 'buy-hold-sell') {
                systemInstruction = `You are a ruthless transfer market expert. I want you to analyze my team "${teamName}" with a strict BUY, HOLD, or SELL perspective.

Context:
- Recent Performance: ${recentPerformance}
- Key Strengths: ${strengths}
- Key Weaknesses: ${weaknesses}

For each key player or problematic area, give a clear verdict:
- BUY: Who should I target to replace weak links?
- HOLD: Who is keeping their place despite a bad week?
- SELL: Who has peaked or is dragging the team down?

Be direct and decisive. Focus on value and future points potential.`;
            } else {
                // General
                systemInstruction = `You are a friendly and insightful FPL assistant. I want you to analyze my team "${teamName}".
            
Context:
- Recent Performance: ${recentPerformance}
- Key Strengths: ${strengths}
- Key Weaknesses: ${weaknesses}

Please provide a concise but insightful initial analysis.
Then, be ready to answer my follow-up questions about transfers, captaincy, and strategy.`;
            }

            return {
                sendMessage: async (message: string) => {
                    const response = await fetch(`${API_BASE}/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message,
                            systemInstruction,
                            history: [] // Stateless for now
                        })
                    });

                    if (!response.ok) throw new Error(`Chat API Error: ${response.statusText}`);
                    const data = await response.json();

                    return {
                        response: {
                            text: () => data.response
                        }
                    };
                }
            };

        } catch (error) {
            console.error("Error starting chat:", error);
            throw error;
        }
    },

    async getHealthReport(players: string[]): Promise<string> {
        try {
            const response = await fetch(`${API_BASE}/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ players })
            });

            if (!response.ok) throw new Error(`Report API Error: ${response.statusText}`);
            const data = await response.json();
            return data.report;
        } catch (error) {
            console.error("Error getting health report:", error);
            throw error;
        }
    },

    async getTransferSuggestions(userSquad: string[], dreamSquad: string[], chipStatus?: string): Promise<string> {
        try {
            const response = await fetch(`${API_BASE}/suggestions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userSquad, dreamSquad, chipStatus })
            });

            if (!response.ok) throw new Error(`Suggestions API Error: ${response.statusText}`);
            const data = await response.json();
            return data.report;
        } catch (error) {
            console.error("Error getting transfer suggestions:", error);
            throw error;
        }
    }
};
