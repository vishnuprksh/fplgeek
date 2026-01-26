import { app } from '../lib/firebase';
import { getFunctions, httpsCallable } from "firebase/functions";

export type AnalysisType = 'general' | 'player' | 'buy-hold-sell';

export const aiService = {
    async generateTeamReport(teamName: string, recentPerformance: string, strengths: string, weaknesses: string): Promise<string> {
        try {
            const functions = getFunctions(app);
            const generateAnalysis = httpsCallable(functions, 'generateTeamAnalysis');

            const result = await generateAnalysis({
                teamName,
                recentPerformance,
                strengths,
                weaknesses
            });

            return (result.data as any).report;
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

            // Return an object that mimics the previous chat interface but calls Cloud Function
            return {
                sendMessage: async (message: string) => {
                    const functions = getFunctions(app);
                    const chatFn = httpsCallable(functions, 'startChat');
                    const result = await chatFn({
                        message,
                        systemInstruction,
                        // History handling would need to be managed here or on backend if we want stateful chat.
                        // For now, we'll send just the current message as a single turn or manage history locally if needed.
                        // The Cloud Function expects 'history' array if we want context.
                        // Let's assume stateless for this simple migration or we'd need to store history in state.
                        history: []
                    });
                    return {
                        response: {
                            text: () => (result.data as any).response
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
            const functions = getFunctions(app);
            const generateReport = httpsCallable(functions, 'generateTeamReport');
            const result = await generateReport({ players });
            return (result.data as any).report;
        } catch (error) {
            console.error("Error getting health report:", error);
            throw error;
        }
    },

    async getTransferSuggestions(userSquad: string[], dreamSquad: string[], chipStatus?: string): Promise<string> {
        try {
            const functions = getFunctions(app);
            const generateSuggestions = httpsCallable(functions, 'generateTransferSuggestions');
            const result = await generateSuggestions({ userSquad, dreamSquad, chipStatus });
            return (result.data as any).report;
        } catch (error) {
            console.error("Error getting transfer suggestions:", error);
            throw error;
        }
    }
};
