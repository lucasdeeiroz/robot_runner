
export interface Device {
    udid: string;
    model: string;
    state?: string;
    is_emulator?: boolean;
    android_version?: string | null;
    battery_level?: number | null;
    ram_total?: number | null;
    ram_used?: number | null;
    storage_total?: number | null;
    storage_used?: number | null;
}

// --- Screen Mapper Types ---
export type UIElementType =
    | 'button'
    | 'input'
    | 'text'
    | 'link'
    | 'toggle'
    | 'checkbox'
    | 'radio'
    | 'dropdown'
    | 'list_item'
    | 'scroll_view'
    | 'image'
    | 'menu'
    | 'tab';

export interface NavigationData {
    destination: string; // Screen Name
    sourceHandle?: string;
    targetHandle?: string;
    vertices?: { x: number; y: number }[];
    // QA & Routing
    trigger_action?: 'tap' | 'swipe' | 'long_press' | 'type';
    is_happy_path?: boolean;
}

export interface UIElementMap {
    id: string; // Unique ID (e.g., resource-id or xpath hash)
    shortId?: string; // Tree structural position (used for fuzzy merging and tracking)
    name: string; // User-defined name
    type: UIElementType;
    description?: string;

    // Locators
    android_id?: string;
    accessibility_id?: string;
    xpath?: string;
    text?: string;

    // Navigation
    navigates_to?: string | NavigationData | NavigationData[] | null;

    // Complex Types
    menu_options?: string[]; // For 'menu' type
    parent_screen?: string; // For 'tab' type

    // AI & QA Hints
    primary_locator?: string;
    expected_data?: string; 
    suggested_interaction?: 'tap' | 'swipe' | 'long_press' | 'type';
    assertion_target?: boolean;
    business_rule?: string;
    explored?: boolean; // Marks dead-end elements that were clicked but did not navigate
}

export interface FlowStep {
    step_number: number;
    source_screen: string;
    action: string;
    element_name: string;
    expected_result: string;
}

export interface FlowMap {
    id: string;
    name: string;
    description?: string;
    steps: FlowStep[];
}

export interface ScreenMap {
    id: string; // File name without extension
    name: string; // User-defined Screen Name
    type: 'screen' | 'modal' | 'tab' | 'drawer';
    description?: string;
    tags?: string[];
    elements: UIElementMap[];
    base64_preview?: string; // Optional: Screenshot thumbnail
    layout?: { 
        node: LayoutNode; 
        edges?: Record<string, LayoutEdge>;
    };
}

// --- Flowchart Layout ---
export interface LayoutNode {
    gridX: number;
    gridY: number;
}

export interface LayoutEdge {
    vertices?: { x: number, y: number }[]; // Manual waypoints
    sourceHandle?: string;
    targetHandle?: string;
}

export interface FlowchartLayout {
    version: number;
    nodes: Record<string, LayoutNode>; // key: Screen Name
    edges: Record<string, LayoutEdge>; // key: Edge ID
}
