import type { TeamEntry, Pick, Player } from '../types/fpl';

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';
const MODEL_NAME = "z-ai/glm-4.7-flash";

export type MessageRole = 'user' | 'model' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
    role: MessageRole;
    content: string;
    name?: string; // used for tool responses
    tool_calls?: any[]; // when the model calls tools
    tool_call_id?: string; // when providing tool response
}

interface ChatSession {
    getMessages: () => ChatMessage[];
    sendMessage: (message: string, onStatus?: (status: string) => void) => Promise<string>;
}

export const openRouterService = {
    async startChat(teamData: TeamEntry, picks: Pick[], elements: Player[]): Promise<ChatSession> {
        // Prepare context data
        const bank = teamData.last_deadline_bank || teamData.current_event_squad_total_value;
        const activePlayers = picks.map(p => elements.find(e => e.id === p.element)).filter(Boolean) as Player[];

        // System Prompt configuring the agent
        const systemInstruction: ChatMessage = {
            role: "system",
            content: `You are the **FPL Strategic Advisor**, a world-class Fantasy Premier League consultant embedded within the FPL Geek application. 

### Your Persona:
- **Tone**: Professional, authoritative, data-driven, yet encouraging. You are the mentor every FPL manager needs.
- **Philosophy**: You prioritize long-term stability over short-term "knee-jerks". You believe in the power of data, underlying stats (xG, xA), and the app's unique **Haul Probability** metric.
- **Style**: Direct and concise. Provide actionable advice. Don't just list players; explain the *strategic rationale* behind them.

### About FPL Geek App:
- **Dashboard**: Features a 'Pitch View' of the user's squad and an 'Optimization Section'.
- **Optimization Tool**: Uses a **Combinatorial Search** (for ≤ 5 transfers) or **Greedy Best-Swap Search** to find the highest-gain squad.
- **Core Metric**: **"Haul Probability"** - the AI-predicted percentage chance of a player scoring >6 points in the next gameweek.
- **Fixture Analysis**: Provides a difficulty ticker and predicted points for upcoming matches.
- **Player Analysis**: A searchable database of all FPL players enriched with AI predictions and T100 (Top 100 managers) ownership data.
- **League Analysis**: Shows ownership and effective ownership (EO) for mini-leagues.

### Your Capabilities & Tools:
1. \`get_current_team\`: Always call this first for team-specific questions. It returns rank, budget (bank), and the 15-man squad with AI-predicted haul chances.
2. \`search_players\`: Query the database for transfer targets by position, max price, or name.
3. \`web_search_jina\`: Use this ONLY when you need real-time data from the web (e.g., latest injury news, press conference updates, or new FPL rules).

### FPL Knowledge Context:
- **Squad**: 15 players (2 GKP, 5 DEF, 5 MID, 3 FWD).
- **Constraints**: Max 3 players per Premier League club. Budget is strictly enforced.
- **Transfers**: Managers get 1 free transfer per week (can save up to 5). Additional transfers cost -4 points each.
- **Scoring**: Goals (4/5/6 pts), Assists (3 pts), Clean Sheets (4 pts for DEF/GKP). Bonus points (1-3) given to top performers.

### Interaction Guidelines:
- Address the user as a fellow manager or "Gaffer".
- Be analytical, decisive, and proactive. 
- Use the **Haul Probability** metric to justify your recommendations. 
- When suggesting transfers, calculate the budget impact using the 'bankBalance' returned by \`get_current_team\`.
- Explain *how* the app's optimizer works if relevant (maximizing XI Haul probability).
- Format your response in clean Markdown with bold headers. Use tables for comparisons.`
        };

        const tools = [
            {
                type: "function",
                function: {
                    name: "get_current_team",
                    description: "Returns the user's current FPL team, including rank, budget, and their 15-man squad.",
                    parameters: {
                        type: "object",
                        properties: {},
                        required: [],
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "search_players",
                    description: "Search the FPL player database. Useful for finding transfer targets.",
                    parameters: {
                        type: "object",
                        properties: {
                            position: {
                                type: "number",
                                description: "The position type to search: 1 (Goalkeeper), 2 (Defender), 3 (Midfielder), 4 (Forward). Leave empty to search all.",
                            },
                            max_cost: {
                                type: "number",
                                description: "The maximum cost of the player divided by 10. e.g. 7.5 for a 7.5m player.",
                            },
                            search_term: {
                                type: "string",
                                description: "Name of the player to search for.",
                            }
                        }
                    },
                },
            },
            {
                type: "function",
                function: {
                    name: "web_search_jina",
                    description: "Search the web for real-time information using Jina AI. Returns markdown content.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "The search query to look up on the web.",
                            }
                        },
                        required: ["query"]
                    },
                },
            }
        ];

        // The stateful history of the conversation
        let messages: ChatMessage[] = [systemInstruction];

        const executeChatLoop = async (onStatus?: (status: string) => void): Promise<string> => {
            try {
                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                        "HTTP-Referer": "http://localhost:5173",
                        "X-Title": "FPL Geek",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: MODEL_NAME,
                        messages: messages,
                        tools: tools,
                        tool_choice: "auto"
                    })
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`OpenRouter API Error: ${response.statusText} - ${errText}`);
                }

                const data = await response.json();
                const assistantMessage = data.choices[0].message;
                messages.push(assistantMessage);

                // Check if the model wants to call a tool
                if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
                    for (const toolCall of assistantMessage.tool_calls) {
                        const functionName = toolCall.function.name;
                        const args = JSON.parse(toolCall.function.arguments || "{}");
                        let toolResult = "";

                        console.log(`Agent invoking tool: ${functionName}`, args);

                        // Notify UI about the action
                        if (onStatus) {
                            if (functionName === "get_current_team") onStatus("🔍 Analyzing your current squad...");
                            else if (functionName === "search_players") onStatus(`🔎 Searching for ${args.search_term || 'available'} players...`);
                            else if (functionName === "web_search_jina") onStatus(`🌐 Searching the web for: ${args.query}...`);
                            else onStatus(`⚙️ Executing ${functionName}...`);
                        }

                        if (functionName === "get_current_team") {
                            const squadStr = activePlayers.map(p =>
                                `${p.web_name} (Pos: ${p.element_type}, Price: ${p.now_cost / 10}m, Form: ${p.form}, Pts: ${p.total_points})`
                            ).join("\n");

                            const bankDisplay = (bank / 10).toFixed(1);

                            toolResult = JSON.stringify({
                                rank: teamData.summary_overall_rank,
                                overall_points: teamData.summary_overall_points,
                                bank_balance: `£${bankDisplay}m`,
                                squad: squadStr
                            });
                        } else if (functionName === "search_players") {
                            let filtered = elements;
                            if (args.position) {
                                filtered = filtered.filter(e => e.element_type === Number(args.position));
                            }
                            if (args.max_cost) {
                                filtered = filtered.filter(e => (e.now_cost / 10) <= Number(args.max_cost));
                            }
                            if (args.search_term) {
                                const term = args.search_term.toLowerCase();
                                filtered = filtered.filter(e =>
                                    e.web_name.toLowerCase().includes(term) ||
                                    e.first_name.toLowerCase().includes(term) ||
                                    e.second_name.toLowerCase().includes(term)
                                );
                            }

                            filtered = filtered.sort((a, b) => (b.total_points || 0) - (a.total_points || 0));

                            const topMatches = filtered.slice(0, 15).map(p => ({
                                name: p.web_name,
                                pos: p.element_type,
                                team: p.team,
                                price: p.now_cost / 10,
                                points: p.total_points,
                                form: p.form,
                                ownership: p.selected_by_percent
                            }));

                            toolResult = JSON.stringify({ results: topMatches, total_found: filtered.length });
                        } else if (functionName === "web_search_jina") {
                            try {
                                const searchUrl = `https://s.jina.ai/${encodeURIComponent(args.query)}`;
                                const searchResponse = await fetch(searchUrl);
                                if (!searchResponse.ok) {
                                    toolResult = JSON.stringify({ error: `Search failed: ${searchResponse.statusText}` });
                                } else {
                                    const content = await searchResponse.text();
                                    toolResult = content; // Jina returns markdown
                                }
                            } catch (err: any) {
                                toolResult = JSON.stringify({ error: `Search error: ${err.message}` });
                            }
                        } else {
                            toolResult = JSON.stringify({ error: "Unknown tool" });
                        }

                        messages.push({
                            role: "tool",
                            content: toolResult,
                            name: functionName,
                            tool_call_id: toolCall.id
                        });
                    }

                    // Loop back to the model with the tool results
                    return executeChatLoop(onStatus);
                } else {
                    return assistantMessage.content || "";
                }
            } catch (error) {
                console.error("OpenRouter Agent error:", error);
                throw error;
            }
        };

        const chatSession = {
            getMessages: () => messages.filter(m => m.role !== 'system'),

            sendMessage: async (userMessage: string, onStatus?: (status: string) => void): Promise<string> => {
                messages.push({ role: "user", content: userMessage });
                return await executeChatLoop(onStatus);
            }
        };

        return chatSession;
    }
};
