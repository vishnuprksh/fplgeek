// multiAgentService.ts — Two-agent FPL Transfer Advisor loop
// Researcher (Google grounding/data) ↔ Manager (rules-based evaluator)
// Uses OpenRouter with Gemini Flash (gemini-2.0-flash-exp)

import type { TeamEntry, Pick, Player } from '../types/fpl';

// Use the valid Gemini API key
const GEMINI_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const MODEL_ID = 'gemini-3-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${GEMINI_KEY}`;

export type AgentRole = 'researcher' | 'manager' | 'system';

export interface ConversationEntry {
    role: AgentRole;
    content: string;
    iteration: number;
    timestamp: Date;
}

export interface AgentContext {
    teamData: TeamEntry;
    picks: Pick[];
    elements: Player[];
    predictionsMap: Record<number, any>;
    t100OwnershipMap: Record<number, any>;
}

// ── OpenRouter REST call ──────────────────────────────────────────────────────

async function callLLM(systemPrompt: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
    // Convert to Gemini format
    const geminiContents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }));

    const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiContents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
    };

    const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${err.slice(0, 300)}`);
    }

    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '(no response)';
}

// ── Jina web search (Google grounding proxy) ──────────────────────────────────

async function jinaSearch(query: string): Promise<string> {
    try {
        const url = `https://s.jina.ai/${encodeURIComponent(query)}`;
        const res = await fetch(url, { headers: { 'Accept': 'text/plain' } });
        if (!res.ok) return ''; // silently skip on any error
        const text = await res.text();
        if (text.length < 50) return ''; // skip empty/useless responses
        return text.slice(0, 2500);
    } catch {
        return ''; // silently skip
    }
}

// ── Build rich team context string ───────────────────────────────────────────

function buildTeamContext(ctx: AgentContext): string {
    const { teamData, picks, elements, predictionsMap, t100OwnershipMap } = ctx;
    const bank = ((teamData.last_deadline_bank || 0) / 10).toFixed(1);
    const currentGW = teamData.current_event || 0;

    const playerLines = picks.map(pick => {
        const el = elements.find(e => e.id === pick.element);
        if (!el) return null;
        const pred = predictionsMap[el.id];
        const t100 = t100OwnershipMap[el.id];
        const pos = ['', 'GKP', 'DEF', 'MID', 'FWD'][el.element_type] || '?';
        const haulPct = pred?.prob_gt_6 != null ? `${(pred.prob_gt_6 * 100).toFixed(0)}%` : 'N/A';
        const t100own = t100?.ownership_percent != null ? `${t100.ownership_percent.toFixed(1)}%` : 'N/A';
        const isBench = pick.position > 11;
        return `  - ${el.web_name} [${pos}] £${(el.now_cost / 10).toFixed(1)}m | Form: ${el.form} | Haul%: ${haulPct} | T100%: ${t100own} | Selected%: ${el.selected_by_percent}%${isBench ? ' (BENCH)' : ''}${pick.is_captain ? ' ©' : ''}${pick.is_vice_captain ? ' (vc)' : ''}`;
    }).filter(Boolean).join('\n');

    return `CURRENT GAMEWEEK: GW${currentGW}
TEAM: ${teamData.name}
Rank: ${teamData.summary_overall_rank?.toLocaleString()} | Points: ${teamData.summary_overall_points} | Bank: £${bank}m

SQUAD:
${playerLines}`;
}

// ── System Prompts ────────────────────────────────────────────────────────────

const RESEARCHER_SYSTEM = (teamContext: string, webContext: string) => `You are the **FPL Researcher** — the lead data-driven scout for a Fantasy Premier League team.

Your job is to initiate the conversation with a comprehensive overview of the current FPL landscape and the team's status.

MANDATORY FIRST RESPONSE CONTENT:
1. 🗓️ **Gameweek Briefing**: Define the **Current Gameweek** and **upcoming conditions** (fixtures, double gameweeks, season stage).
2. 🌐 **FPL World Trends**: Summarize the latest FPL news, injuries, and popular transfer trends using the provided web research.
3. 📊 **Team Status Report**: Analyze the team's current rank, bank balance (£${teamContext.match(/Bank: £([\d.]+)m/)?.[1] || '0.0'}m), and underperforming assets.
4. 🔄 **Strategy Proposal**: Recommend 1-2 specific transfers based on this holistic view.

CRITICAL: Always use the **CURRENT GAMEWEEK** provided in the team data. Do NOT hallucinate.

Structure subsequent responses as:
**📊 Evidence-Based Scouting** — data-backed validation of the Manager's feedback.
**🔄 Refined Recommendations** — OUT: [Name] → IN: [Name] £Xm | Supporting data.
**📅 Fixture/Injury Check** — latest news for proposed moves.

Be objective and concise. Max 400 words.

Current Team Data:
${teamContext}

${webContext ? `Live Web Research:\n${webContext}` : ''}`;

const MANAGER_SYSTEM = (teamContext: string) => `You are the **FPL Manager** — a ruthless, rules-strict evaluator of transfer strategies.

Your job is to review the Researcher's proposals against FPL best practices, rules, and long-term team vision.

MANDATORY RULES:
1. 💰 **Bank Management**: Always respect the current bank balance (£${teamContext.match(/Bank: £([\d.]+)m/)?.[1] || '0.0'}m).
2. 📏 **FPL Rule Adherence**:
    - Ownership: Ensure a balance of template and differential players.
    - Captaincy: Ensure the captaincy choice is reliable.
    - Hits: Challenge any hit (-4pt) unless clearly justified by long-term gains.
3. 📉 **Form/Fixtures**: Avoid players with poor form or difficult near-term fixtures.

Evaluation Flow:
- Critically review the Researcher's strategy.
- Point out violations, suggest better alternatives, or ask for more data.
- If the plan is solid, respond with: **MANAGER APPROVED ✅** followed by a 2-sentence summary.

Be decisive. Max 250 words.

Current Team Data:
${teamContext}`;

// ── Main agent loop ───────────────────────────────────────────────────────────

export async function runAgentLoop(
    ctx: AgentContext,
    onMessage: (entry: ConversationEntry) => void,
    onStatus: (status: string) => void
): Promise<ConversationEntry[]> {
    const teamContext = buildTeamContext(ctx);
    const log: ConversationEntry[] = [];
    const MAX_ITERATIONS = 10;

    // Each agent maintains its own running conversation history
    const researcherMsgs: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const managerMsgs: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    const addEntry = (role: AgentRole, content: string, iteration: number) => {
        const entry: ConversationEntry = { role, content, iteration, timestamp: new Date() };
        log.push(entry);
        onMessage(entry);
        return entry;
    };

    // ── Fetch web context once upfront ─────────────────────────────────────────
    let webContext = '';
    onStatus('🌐 Searching for latest FPL news...');
    try {
        const [news, transfers] = await Promise.all([
            jinaSearch('FPL Fantasy Premier League injury news suspensions February 2026'),
            jinaSearch('FPL best transfers recommended picks gameweek 2026 form players')
        ]);
        const combined = [news, transfers].filter(s => s.length > 0).join('\n\n');
        webContext = combined.length > 0 ? combined : '';
    } catch {
        webContext = '';
    }

    let managerFeedback = '';
    const currentGW = ctx.teamData.current_event || 0;

    for (let i = 1; i <= MAX_ITERATIONS; i++) {

        // ── Researcher turn ──────────────────────────────────────────────────────
        onStatus(`🔬 Researcher initiating analysis... (Iteration ${i}/${MAX_ITERATIONS})`);

        const researcherInput = i === 1
            ? `State of the Game (Current Gameweek: GW${currentGW}): Provide a full report on the FPL world, team status, and propose our strategy.`
            : `Manager's feedback on your previous proposal:\n\n${managerFeedback}\n\nRefine your recommendations based on this feedback.`;

        researcherMsgs.push({ role: 'user', content: researcherInput });
        const researcherReply = await callLLM(RESEARCHER_SYSTEM(teamContext, i === 1 ? webContext : ''), researcherMsgs);
        researcherMsgs.push({ role: 'assistant', content: researcherReply });
        addEntry('researcher', researcherReply, i);

        // ── Manager turn ─────────────────────────────────────────────────────────
        onStatus(`👔 Manager evaluating... (Iteration ${i}/${MAX_ITERATIONS})`);

        const managerInput = `Iteration ${i} — Researcher's report and proposal:\n\n${researcherReply}\n\nEvaluate this against your rules and long-term strategy.`;

        managerMsgs.push({ role: 'user', content: managerInput });
        const managerReply = await callLLM(MANAGER_SYSTEM(teamContext), managerMsgs);
        managerMsgs.push({ role: 'assistant', content: managerReply });
        addEntry('manager', managerReply, i);

        // Approval check
        if (managerReply.includes('MANAGER APPROVED') || managerReply.includes('APPROVED ✅')) {
            addEntry('system', `✅ **Analysis complete** — Manager approved after ${i} iteration${i > 1 ? 's' : ''}. See the final approved plan above.`, i);
            break;
        }

        managerFeedback = managerReply;

        if (i === MAX_ITERATIONS) {
            addEntry('system', `⏹️ **Max iterations (${MAX_ITERATIONS}) reached.** Review the full debate above for the latest recommendations.`, i);
        }
    }

    return log;
}
