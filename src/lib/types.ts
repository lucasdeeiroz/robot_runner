
export interface Device {
    udid: string;
    model: string;
    state?: string;
    is_emulator?: boolean;
    android_version?: string | null; // Added field
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

export interface UIElementMap {
    id: string; // Unique ID (e.g., resource-id or xpath hash)
    name: string; // User-defined name
    type: UIElementType;
    description?: string;

    // Locators
    android_id?: string;
    accessibility_id?: string;
    xpath?: string;
    text?: string;

    // Navigation
    navigates_to?: string; // Screen Name

    // Complex Types
    menu_options?: string[]; // For 'menu' type
    parent_screen?: string; // For 'tab' type
}

export interface ScreenMap {
    id: string; // File name without extension
    name: string; // User-defined Screen Name
    type: 'screen' | 'modal' | 'tab' | 'drawer';
    description?: string;
    elements: UIElementMap[];
    base64_preview?: string; // Optional: Screenshot thumbnail
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
