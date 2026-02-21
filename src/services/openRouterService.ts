import type { TeamEntry, Pick, Player } from '../types/fpl';

const OPENROUTER_API_KEY = "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";
const MODEL_NAME = "z-ai/glm-4.7-flash";

export type MessageRole = 'user' | 'model' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
    role: MessageRole;
    content: string;
    name?: string; // used for tool responses
    tool_calls?: any[]; // when the model calls tools
    tool_call_id?: string; // when providing tool response
}

export const openRouterService = {
    async startChat(teamData: TeamEntry, picks: Pick[], elements: Player[]) {
        // Prepare context data
        const bank = teamData.last_deadline_bank || teamData.current_event_squad_total_value; // Fallback if bank not available
        const activePlayers = picks.map(p => elements.find(e => e.id === p.element)).filter(Boolean) as Player[];

        // System Prompt configuring the agent
        const systemInstruction: ChatMessage = {
            role: "system",
            content: `You are an expert, proactive, and analytical Fantasy Premier League (FPL) AI agent. 
You act as an interactive advisor, and you have access to two distinct tools to help the user:
1. \`get_current_team\`: Use this to get the user's current 15-man squad, overall rank, and available bank balance.
2. \`search_players\`: Use this to query the FPL database for alternative players by position, max price, or name.

Instructions:
- If a user asks a question about their team, ALWAYS call the \`get_current_team\` tool first to orient yourself.
- If a user asks for transfer recommendations or who is best/weakest, analyze the current team, then call \`search_players\` to find specific replacements.
- Be decisive. You are equipped with knowledge and tools; use them to calculate budgets and compare players before answering.
- Use the online web search capability automatically integrated into your model to read recent news (injuries, manager press conferences) if a player's status is in doubt.
- Output your final answer in clean, easy-to-read markdown.
`
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
            }
        ];

        // The stateful history of the conversation
        let messages: ChatMessage[] = [systemInstruction];

        const chatSession = {
            getMessages: () => messages.filter(m => m.role !== 'system'),

            sendMessage: async (userMessage: string): Promise<string> => {
                messages.push({ role: "user", content: userMessage });

                return await executeChatLoop();
            }
        };

        const executeChatLoop = async (): Promise<string> => {
            try {
                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                        "HTTP-Referer": "http://localhost:5173", // Optional, for OpenRouter tracking
                        "X-Title": "FPL Geek", // Optional, for OpenRouter tracking
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: MODEL_NAME,
                        messages: messages,
                        tools: tools,
                        tool_choice: "auto",
                        plugins: [{ id: "web", max_results: 3 }] // Enable OpenRouter native web search plugin
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

                            // Sort by total points to return the best ones first
                            filtered = filtered.sort((a, b) => (b.total_points || 0) - (a.total_points || 0));

                            // Return top 15 matches to save tokens
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
                        } else {
                            toolResult = JSON.stringify({ error: "Unknown tool" });
                        }

                        // Append tool response
                        messages.push({
                            role: "tool",
                            content: toolResult,
                            name: functionName,
                            tool_call_id: toolCall.id
                        });
                    }

                    // Loop back to the model with the tool results
                    return executeChatLoop();
                } else {
                    // No tool calls, return final text
                    return assistantMessage.content || "";
                }
            } catch (error) {
                console.error("OpenRouter Agent error:", error);
                throw error;
            }
        };

        return chatSession;
    }
};
