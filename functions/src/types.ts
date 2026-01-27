
export interface Team {
    id: number;
    name: string;
    short_name: string;
}

export interface Event {
    id: number;
    name: string;
    deadline_time: string;
    is_previous: boolean;
    is_current: boolean;
    is_next: boolean;
}

export interface ElementType {
    id: number;
    plural_name: string;
    singular_name_short: string;
}
