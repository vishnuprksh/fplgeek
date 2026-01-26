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

export interface UnifiedPlayer {
    id: number;
    code: number;
    web_name: string;
    element_type: number;
    team: number;
    now_cost: number;
    total_points: number;
    // Add other fields as necessary for ingestion
    first_name?: string;
    second_name?: string;
    selected_by_percent?: string;
    minutes?: number;
}

export interface Match {
    id: number;
    event: number;
    finished: boolean;
    team_h: number;
    team_a: number;
    team_h_score: number;
    team_a_score: number;
    kickoff_time: string;
}
