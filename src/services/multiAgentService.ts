// multiAgentService.ts — Two-agent FPL Transfer Advisor loop
// Researcher (Google grounding/data) ↔ Manager (rules-based evaluator)
// Uses OpenRouter with Gemini Flash (gemini-2.0-flash-exp)

import type { TeamEntry, Pick, Player } from '../types/fpl';

// Use the valid Gemini API key
const GEMINI_KEY = import.meta.env.VITE_GOOGLE_API_KEY || '';
const MODEL_ID = 'gemini-3-flash-preview';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${GEMINI_KEY}`;

export type AgentRole = 'tactical_manager' | 'senior_manager' | 'system';

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
    events: any[];
}

// ── OpenRouter REST call ──────────────────────────────────────────────────────

async function callLLM(systemPrompt: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
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
        if (!res.ok) return '';
        const text = await res.text();
        if (text.length < 50) return '';
        return text.slice(0, 2500);
    } catch {
        return '';
    }
}

// ── Build rich team context string ───────────────────────────────────────────

function buildTeamContext(ctx: AgentContext): string {
    const { teamData, picks, elements, predictionsMap, t100OwnershipMap, events } = ctx;
    const bank = ((teamData.last_deadline_bank || 0) / 10).toFixed(1);
    const currentGW = teamData.current_event || 0;
    const transfersMade = teamData.last_deadline_total_transfers || 0;

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

    // Simple DGW/BGW detection
    const upcomingEvents = events.filter(e => e.id >= currentGW && e.id <= currentGW + 5);
    const scheduleContext = upcomingEvents.map(e => `GW${e.id}: ${e.name}`).join(', ');

    return `CURRENT GAMEWEEK: GW${currentGW}
TEAM: ${teamData.name}
Rank: ${teamData.summary_overall_rank?.toLocaleString()} | Points: ${teamData.summary_overall_points}
Bank: £${bank}m | Transfers Made: ${transfersMade}
Upcoming: ${scheduleContext}

SQUAD:
${playerLines}`;
}

// ── System Prompts ────────────────────────────────────────────────────────────

const TACTICAL_MANAGER_SYSTEM = (teamContext: string, webContext: string) => `You are the **Tactical Manager** — an expert in short-term squad optimization and player form.

Your role in this discussion is to analyze the squad's immediate needs and propose specific tactical changes.

🛡️ **Mutual Correction & Fact-Checking**: You are responsible for auditing the Senior Manager's strategy. If they suggest a move that violates FPL rules, ignores an injury, or miscalculates fixtures/bank balance, you MUST point out the mistake and suggest a correction before proceeding.

DISCUSS THE FOLLOWING POINTS:
1. 🛡️ **Squad Strength/Weaknesses**: Identify where the team is heavy or lacking (e.g., weak defense, underperforming attack).
2. 🔨 **"Broken Cards" (Must-Haves)**: Identify players who are essential in the current meta that we don't have.
3. 🗑️ **"Bad Cards" (Must-Sells)**: Identify players who are underperforming or have poor fixtures and must be removed.
4. 🗓️ **Current GW Conditions**: Analyze the immediate fixtures and player availability (audit for injuries/suspensions).

MANDATORY FIRST RESPONSE:
- Open the discussion with the Senior Manager by providing a tactical summary of the team.
- Propose an immediate action plan for the next 1-2 gameweeks.

If you agree with the Senior Manager's proposed strategy, you MUST include the phrase: **TACTICAL APPROVAL ✅**.

Current Team & Context:
${teamContext}

${webContext ? `Latest FPL Intel:\n${webContext}` : ''}`;

const SENIOR_MANAGER_SYSTEM = (teamContext: string) => `You are the **Senior Manager** — the strategist focused on long-term planning, chip management, and financial health.

Your role is to evaluate the Tactical Manager's proposals and ensure they align with the bigger picture.

🛡️ **Strategic Audit & Correction**: You must critically evaluate the Tactical Manager's suggestions. If they propose an injured player, mention a player for the wrong team, or suggest a move we cannot afford, you MUST correct them immediately. Accuracy is paramount.

DISCUSS THE FOLLOWING POINTS:
1. 💰 **Financial Strategy**: Managing the bank balance (£${teamContext.match(/Bank: £([\d.]+)m/)?.[1] || '0.0'}m) and squad value.
2. 🃏 **Chip Strategy**: When to play Wildcard, Free Hit, Bench Boost, or Triple Captain based on upcoming Double/Blank Gameweeks.
3. 🗺️ **Long-term Movements**: Planning for Double (DGW) and Blank (BGW) gameweeks over the next 4-6 weeks (verify fixtures are correct).
4. 🔄 **Transactions**: Managing the number of transfers and potential hits.

Your job is to debate and refine the strategy with the Tactical Manager.

If you are satisfied with the final strategic plan, you MUST include the phrase: **SENIOR APPROVAL ✅**.

Current Team & Context:
${teamContext}`;

// ── Main agent loop ───────────────────────────────────────────────────────────

export async function runAgentLoop(
    ctx: AgentContext,
    onMessage: (entry: ConversationEntry) => void,
    onStatus: (status: string) => void
): Promise<ConversationEntry[]> {
    const teamContext = buildTeamContext(ctx);
    const log: ConversationEntry[] = [];
    const MAX_ITERATIONS = 12;

    const tacticalMsgs: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const seniorMsgs: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    const addEntry = (role: AgentRole, content: string, iteration: number) => {
        const entry: ConversationEntry = { role, content, iteration, timestamp: new Date() };
        log.push(entry);
        onMessage(entry);
        return entry;
    };

    // ── Fetch web context ──────────────────────────────────────────────────────
    onStatus('🌐 Gathering tactical intelligence...');
    let webContext = '';
    try {
        const [news, meta] = await Promise.all([
            jinaSearch(`FPL injuries suspensions fixtures news February 2026 GW${ctx.teamData.current_event}`),
            jinaSearch('FPL current meta players essential picks broken cards')
        ]);
        webContext = [news, meta].filter(s => s.length > 0).join('\n\n');
    } catch { }

    let _lastTacticalReply = '';
    let lastSeniorReply = '';

    for (let i = 1; i <= MAX_ITERATIONS; i++) {
        // ── Tactical Manager turn ──────────────────────────────────────────────
        onStatus(`🔬 Tactical Manager analyzing... (Iteration ${i}/${MAX_ITERATIONS})`);

        const tacticalInput = i === 1
            ? "Initiate the strategic transaction discussion for our team. Focus on current GW conditions, strengths, weaknesses, must-haves, and must-sells."
            : `The Senior Manager responded:\n\n${lastSeniorReply}\n\nRefine the tactical plan or provide final approval if the strategy is optimal.`;

        tacticalMsgs.push({ role: 'user', content: tacticalInput });
        const tacticalReply = await callLLM(TACTICAL_MANAGER_SYSTEM(teamContext, i === 1 ? webContext : ''), tacticalMsgs);
        tacticalMsgs.push({ role: 'assistant', content: tacticalReply });
        addEntry('tactical_manager', tacticalReply, i);
        _lastTacticalReply = tacticalReply;

        // ── Senior Manager turn ───────────────────────────────────────────────
        onStatus(`👔 Senior Manager strategizing... (Iteration ${i}/${MAX_ITERATIONS})`);

        const seniorInput = `The Tactical Manager proposed:\n\n${tacticalReply}\n\nEvaluate this against our financial state, chip strategy, and upcoming DGW/BGW movements.`;

        seniorMsgs.push({ role: 'user', content: seniorInput });
        const seniorReply = await callLLM(SENIOR_MANAGER_SYSTEM(teamContext), seniorMsgs);
        seniorMsgs.push({ role: 'assistant', content: seniorReply });
        addEntry('senior_manager', seniorReply, i);
        lastSeniorReply = seniorReply;

        // Dual Approval Check
        const tacticalApproved = tacticalReply.includes('TACTICAL APPROVAL');
        const seniorApproved = seniorReply.includes('SENIOR APPROVAL');

        if (tacticalApproved && seniorApproved) {
            addEntry('system', `🤝 **Strategy Finalized** — Both managers have reached an agreement. Implementation plan locked.`, i);
            break;
        }

        if (i === MAX_ITERATIONS) {
            addEntry('system', `⏹️ **Strategic Timeout** — Reached max discussion steps. Review the debate for the best consensus.`, i);
        }
    }

    return log;
}

