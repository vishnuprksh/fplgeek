export interface TeamEntry {
    id: number;
    joined_time: string;
    started_event: number;
    favourite_team: number;
    player_first_name: string;
    player_last_name: string;
    player_region_id: number;
    player_region_name: string;
    player_region_iso_code_short: string;
    player_region_iso_code_long: string;
    summary_overall_points: number;
    summary_overall_rank: number;
    summary_event_points: number;
    summary_event_rank: number;
    current_event_squad_total_value: number;
    name: string;
    name_change_blocked: boolean;
    kit: string | null;
    last_deadline_bank: number;
    last_deadline_value: number;
    last_deadline_total_transfers: number;
    current_event: number;
}

export interface Player {
    id: number;
    code: number;
    web_name: string;
    first_name: string;
    second_name: string;
    element_type: number; // 1: GKP, 2: DEF, 3: MID, 4: FWD
    team: number;
    now_cost: number;
    total_points: number;
    event_points: number;
    selected_by_percent: string;
    form: string;
    ep_this: string;
    ep_next: string;
    photo: string;
    minutes: number;
    chance_of_playing_next_round: number | null;
    chance_of_playing_this_round: number | null;
    influence: string;
    creativity: string;
    threat: string;
    ict_index: string;
    saves: number;
    points_per_game: string;
    status: string;
    cost_change_start: number;
    smart_value?: number;
    stats?: {
        wMin: number;
        wInf: number;
        wThr: number;
        wIct: number;
        type: number;
        cost: number;
    };
}

export interface Team {
    id: number;
    name: string;
    short_name: string;
}

export interface ElementType {
    id: number;
    plural_name: string;
    singular_name_short: string;
}

export interface Event {
    id: number;
    name: string;
    deadline_time: string;
    is_previous: boolean;
    is_current: boolean;
    is_next: boolean;
}

export interface BootstrapStatic {
    events: Event[];
    teams: Team[];
    elements: UnifiedPlayer[];
    element_types: ElementType[];
}

export interface Pick {
    element: number;
    position: number;
    multiplier: number;
    is_captain: boolean;
    is_vice_captain: boolean;
    selling_price: number;
    purchase_price: number;
}

export interface Match {
    id: number;
    event: number; // Gameweek
    finished: boolean;
    team_h: number; // Home Team ID
    team_a: number; // Away Team ID
    team_h_score: number;
    team_a_score: number;
    kickoff_time: string;
}

export interface TeamPicks {
    active_chip: string | null;
    entry_history: {
        points: number;
        total_points: number;
        rank: number;
        rank_sort: number;
        overall_rank: number;
        bank: number;
        value: number;
        event_transfers: number;
        event_transfers_cost: number;
    };
    picks: Pick[];
}

export interface PlayerHistory {
    element: number;
    fixture: number;
    opponent_team: number;
    total_points: number;
    was_home: boolean;
    kickoff_time: string;
    team_h_score: number;
    team_a_score: number;
    round: number;
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    goals_conceded: number;
    own_goals: number;
    penalties_saved: number;
    penalties_missed: number;
    yellow_cards: number;
    red_cards: number;
    saves: number;
    bonus: number;
    bps: number;
    influence: string;
    creativity: string;
    threat: string;
    ict_index: string;
    value: number;
    transfers_balance: number;
    selected: number;
    transfers_in: number;
    transfers_out: number;

    // Advanced Stats
    expected_goals?: string;
    expected_assists?: string;
    expected_goal_involvements?: string;
    expected_goals_conceded?: string;

    // Computed/Enriched
    smart_value?: number;
    smart_score?: number;
}

export interface PlayerSummary {
    fixtures: any[];
    history: PlayerHistory[];
    history_past: any[];
}

export interface UnifiedPlayer extends Player {
    history: (PlayerHistory & { season?: string })[];
}
