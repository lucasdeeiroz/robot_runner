import { ScreenMap, UIElementMap } from '@/lib/types';
import { InspectorNode, generateXPath } from '@/lib/inspectorUtils';

export const DESTRUCTIVE_TERMS = ['erase', 'delete', 'remove', 'exclude', 'apagar', 'deletar', 'remover', 'excluir', 'eliminar', 'deletar', 'borrar'];
export const ESCAPE_TERMS = ['next', 'proceed', 'continue', 'ok', 'confirm', 'save', 'done', 'próximo', 'próxima', 'prosseguir', 'continuar', 'confirmar', 'salvar', 'concluir'];

export interface ExplorationConfig {
    priorityKeywords: string[];
    avoidKeywords: string[];
    revisitKnownScreens: boolean;
    escapeTargets?: string[];
    forceReexplore?: string[];
    targetPackage?: string;
    allowedPackages?: string[];
}

export const DEFAULT_EXPLORATION_CONFIG: ExplorationConfig = {
    priorityKeywords: [],
    avoidKeywords: [],
    revisitKnownScreens: false,
    escapeTargets: [],
    forceReexplore: [],
    targetPackage: undefined,
    allowedPackages: [],
};

export enum GraphState {
    UNEXPLORED = 0,
    EXPLORING = 1,
    EXHAUSTED = 2
}

export interface ExplorationState {
    visitedScreens: string[]; // Screen names
    visitedElements: string[]; // Element IDs (XPath or Resource-ID)
    logs: LogEntry[];
    thoughts: string[]; // AI thoughts per step
    maxSteps: number;
    currentStep: number;
    targetPackage?: string;
    consecutiveSwipes: number;
    previousElementsSnapshot?: string;
    screenVisitCount: Record<string, number>; // Track how many times each screen was visited
    actionFingerprints: Record<string, number>; // Track repeated screen:action:target combos
    initialScreenName?: string; // The first screen mapped in the session
    // Back-update tracking: what was the last navigation that brought us here?
    previousScreenName?: string;
    previousActionTargetId?: string; // short_id of the element clicked on the previous screen
    previousActionType?: string; // type of action (click, etc.)
    sessionId?: string; // Session ID for Claude Code continuity
    priorityKeywords: string[];
    avoidKeywords: string[];
    forceReexplore: string[];
}

export interface ExplorationAction {
    type: 'click' | 'back' | 'swipe' | 'finish' | 'error' | 'type_text';
    targetId?: string;
    direction?: 'up' | 'down' | 'left' | 'right';
    text?: string;
    details?: string;
}

export interface ExplorationResult {
    newScreen: ScreenMap;
    nextAction: ExplorationAction;
    isHeuristic?: boolean;
}

export interface LogEntry {
    text: string;
    type: 'action' | 'info' | 'debug' | 'error' | 'ai' | 'rationale' | 'transition' | 'finished' | 'stopped' | 'step' | 'warning';
    timestamp: string;
    stepNumber?: number;
}

/**
 * Utility to manage the autonomous exploration session state.
 */
export class AutonomousExplorer {
    private state: ExplorationState;
    private t: (key: string, options?: any) => string;

    // Graph Machine State
    private screenGlobalStates: Record<string, GraphState> = {};
    private elementGlobalStates: Record<string, GraphState> = {};

    constructor(
        t: (key: string, options?: any) => string,
        initialMaxSteps: number = 9999,
        config?: ExplorationConfig,
        knownScreens?: ScreenMap[]
    ) {
        this.t = t;
        this.state = {
            visitedScreens: [],
            visitedElements: [],
            logs: [],
            thoughts: [],
            maxSteps: initialMaxSteps,
            currentStep: 0,
            consecutiveSwipes: 0,
            screenVisitCount: {},
            actionFingerprints: {},
            priorityKeywords: config?.priorityKeywords ?? [],
            avoidKeywords: config?.avoidKeywords ?? [],
            forceReexplore: config?.forceReexplore ?? [],
        };

        if (config && !config.revisitKnownScreens && knownScreens?.length) {
            knownScreens.forEach(s => this.markScreenVisited(s.name));
        }
    }

    public addLog(message: string, type: LogEntry['type'] = 'info', stepNumber?: number) {
        const timestamp = new Date().toLocaleTimeString();
        this.state.logs.push({
            text: message,
            type,
            timestamp,
            stepNumber
        });
        console.log(`[Exploration:${type}] ${message}`);
    }

    public addThought(thought: string) {
        this.state.thoughts.push(thought);
        this.addLog(thought, 'ai');
    }

    public isAlreadyVisited(screenName: string): boolean {
        return this.state.visitedScreens.includes(screenName);
    }

    public markScreenVisited(screenName: string) {
        if (!this.state.visitedScreens.includes(screenName)) {
            this.state.visitedScreens.push(screenName);
            this.addLog(this.t('mapper.exploration.mapped_new_screen', { screenName }));
        }
    }

    public markElementVisited(elementId: string) {
        if (!this.state.visitedElements.includes(elementId)) {
            this.state.visitedElements.push(elementId);
        }
    }

    public incrementStep() {
        this.state.currentStep++;
    }

    public registerSwipeAction(elementsSnapshot: string) {
        this.state.consecutiveSwipes++;
        this.state.previousElementsSnapshot = elementsSnapshot;
    }

    public resetSwipeCount() {
        this.state.consecutiveSwipes = 0;
        this.state.previousElementsSnapshot = undefined;
    }

    public getConsecutiveSwipes(): number {
        return this.state.consecutiveSwipes;
    }

    public getPreviousElementsSnapshot(): string | undefined {
        return this.state.previousElementsSnapshot;
    }

    public setTargetPackage(pkg: string) {
        this.state.targetPackage = pkg;
        this.addLog(this.t('mapper.exploration.target_package_identified', { pkg }));
    }

    public getTargetPackage(): string | undefined {
        return this.state.targetPackage;
    }

    public setInitialScreenName(name: string) {
        if (!this.state.initialScreenName) {
            this.state.initialScreenName = name;
        }
    }

    public getInitialScreenName(): string | undefined {
        return this.state.initialScreenName;
    }

    /**
     * Tracks a screen visit with an action fingerprint.
     * Returns how many times the SAME action has been repeated on this screen.
     * This allows the AI to visit the same screen many times as long as it explores different elements.
     */
    public trackScreenVisit(screenName: string, actionFingerprint?: string): number {
        this.state.screenVisitCount[screenName] = (this.state.screenVisitCount[screenName] || 0) + 1;

        if (actionFingerprint) {
            const count = (this.state.actionFingerprints[actionFingerprint] || 0) + 1;
            this.state.actionFingerprints[actionFingerprint] = count;
            return count;
        }

        return this.state.screenVisitCount[screenName];
    }

    /** Returns true if the screen has been visited too many times (stuck loop). */
    public isScreenLooping(screenName: string, threshold: number = 4): boolean {
        return (this.state.screenVisitCount[screenName] || 0) >= threshold;
    }

    public shouldStop(): boolean {
        return this.state.currentStep >= this.state.maxSteps;
    }

    public getLogs(): LogEntry[] {
        return this.state.logs;
    }

    public getFormattedLogs(): string[] {
        return this.state.logs.map(log => {
            const prefix = log.type !== 'info' && log.type !== 'step' ? `${log.type.toUpperCase()}: ` : "";
            return `[${log.timestamp}] ${prefix}${log.text}`;
        });
    }

    public getState(): ExplorationState {
        return { ...this.state };
    }

    /**
     * Records the current screen and the action taken, so the next step can
     * back-update the previous screen's element with navigates_to.
     */
    public setPreviousNavigation(screenName: string, actionTargetId?: string, actionType?: string) {
        this.state.previousScreenName = screenName;
        this.state.previousActionTargetId = actionTargetId;
        this.state.previousActionType = actionType;
    }

    /**
     * Returns the previous navigation context (screen name + clicked element id).
     * Returns undefined if no previous navigation is recorded (first step or after back).
     */
    public getPreviousNavigation(): { screenName: string; targetId?: string; actionType?: string } | undefined {
        if (!this.state.previousScreenName) return undefined;
        return {
            screenName: this.state.previousScreenName,
            targetId: this.state.previousActionTargetId,
            actionType: this.state.previousActionType,
        };
    }

    /** Clears previous navigation (e.g., after a back action or swipe). */
    public clearPreviousNavigation() {
        this.state.previousScreenName = undefined;
        this.state.previousActionTargetId = undefined;
        this.state.previousActionType = undefined;
    }

    public setSessionId(sessionId: string) {
        this.state.sessionId = sessionId;
    }

    public getSessionId(): string | undefined {
        return this.state.sessionId;
    }

    // --- Heuristic DFS Navigation ---

    private calculateGraphStates(knownScreens: ScreenMap[], forceReexplore: string[]) {
        this.screenGlobalStates = {};
        this.elementGlobalStates = {};

        const screenMap = new Map<string, ScreenMap>();
        knownScreens.forEach(s => screenMap.set(s.name, s));

        const inPath = new Set<string>();

        const evaluateScreen = (screenName: string): GraphState => {
            if (this.screenGlobalStates[screenName] !== undefined) {
                return this.screenGlobalStates[screenName];
            }

            if (inPath.has(screenName)) {
                return GraphState.EXHAUSTED;
            }

            inPath.add(screenName);

            const screen = screenMap.get(screenName);
            if (!screen) {
                inPath.delete(screenName);
                return GraphState.EXPLORING;
            }

            if (forceReexplore.includes(screenName)) {
                this.screenGlobalStates[screenName] = GraphState.EXPLORING;
                inPath.delete(screenName);
                return GraphState.EXPLORING;
            }

            const interactiveElements = screen.elements.filter(e =>
                e.type === 'button' || e.type === 'input' || e.type === 'checkbox' ||
                e.type === 'radio' || e.type === 'list_item' || e.type === 'tab' ||
                e.navigates_to != null
            );

            let hasUnexplored = false;
            let hasExploring = false;

            interactiveElements.forEach(el => {
                const elKey = `${screenName}::${el.id}`;
                const targets = el.navigates_to ? (Array.isArray(el.navigates_to) ? el.navigates_to : (typeof el.navigates_to === 'string' ? el.navigates_to.split(',') : [el.navigates_to])) : [];

                const isVisited = this.state.visitedElements.includes(el.id) ||
                    (el.xpath && this.state.visitedElements.includes(el.xpath)) ||
                    el.explored;

                if (targets.length === 0) {
                    if (isVisited) {
                        this.elementGlobalStates[elKey] = GraphState.EXHAUSTED;
                    } else {
                        this.elementGlobalStates[elKey] = GraphState.UNEXPLORED;
                        hasUnexplored = true;
                    }
                } else {
                    let elExhausted = true;
                    let elExploring = false;

                    targets.forEach((t: any) => {
                        const tState = evaluateScreen(typeof t === 'string' ? t.trim() : t.id || '');
                        if (tState === GraphState.UNEXPLORED || tState === GraphState.EXPLORING) {
                            elExhausted = false;
                            elExploring = true;
                        }
                    });

                    if (elExhausted) {
                        this.elementGlobalStates[elKey] = GraphState.EXHAUSTED;
                    } else if (elExploring) {
                        this.elementGlobalStates[elKey] = GraphState.EXPLORING;
                        hasExploring = true;
                    } else {
                        // This fallback theoretically shouldn't happen with the new logic above, but kept for safety.
                        this.elementGlobalStates[elKey] = GraphState.UNEXPLORED;
                        hasUnexplored = true;
                    }
                }
            });

            inPath.delete(screenName);

            let finalState = GraphState.EXHAUSTED;
            if (hasUnexplored || hasExploring) {
                if (this.state.visitedScreens.includes(screenName)) {
                    finalState = GraphState.EXPLORING;
                } else {
                    finalState = GraphState.UNEXPLORED;
                }
            }

            this.screenGlobalStates[screenName] = finalState;
            return finalState;
        };

        knownScreens.forEach(s => {
            evaluateScreen(s.name);
            if (!forceReexplore.includes(s.name)) {
                if (!this.state.visitedScreens.includes(s.name)) {
                    this.state.visitedScreens.push(s.name);
                }
            }
        });
    }

    public getGraphSummaryLog(maps: ScreenMap[], title: string = 'Resumo Final do Grafo'): string {
        this.calculateGraphStates(maps, this.state.forceReexplore || []);

        let unexploredScreens = 0;
        let exploringScreens = 0;
        let exhaustedScreens = 0;

        let unexploredElements = 0;
        let exploringElements = 0;
        let exhaustedElements = 0;

        maps.forEach(m => {
            const sState = this.screenGlobalStates[m.name];
            if (sState === GraphState.UNEXPLORED) unexploredScreens++;
            else if (sState === GraphState.EXPLORING) exploringScreens++;
            else if (sState === GraphState.EXHAUSTED) exhaustedScreens++;

            m.elements.forEach(e => {
                if (e.type === 'button' || e.type === 'input' || e.type === 'checkbox' ||
                    e.type === 'radio' || e.type === 'list_item' || e.type === 'tab' ||
                    e.navigates_to != null) {
                    const eState = this.elementGlobalStates[`${m.name}::${e.id}`];
                    if (eState === GraphState.UNEXPLORED) unexploredElements++;
                    else if (eState === GraphState.EXPLORING) exploringElements++;
                    else if (eState === GraphState.EXHAUSTED) exhaustedElements++;
                }
            });
        });

        return `📊 ${title}:\n- Telas: ${exhaustedScreens} Exhausted, ${exploringScreens} Exploring, ${unexploredScreens} Unexplored\n- Elementos: ${exhaustedElements} Exhausted, ${exploringElements} Exploring, ${unexploredElements} Unexplored`;
    }

    /**
     * Finds the next unvisited interactive element on the screen using DFS.
     */
    public determineHeuristicAction(root: InspectorNode, currentScreenName?: string, currentSavedMaps?: ScreenMap[]): ExplorationAction | null {
        // ALWAYS dynamically recalculate graph states to reflect new mapped UI or visited elements
        if (currentSavedMaps && currentSavedMaps.length > 0) {
            this.calculateGraphStates(currentSavedMaps, this.state.forceReexplore || []);
        }

        if (!currentScreenName) {
            currentScreenName = this.generateHeuristicScreenMap(root).name;
        }

        const visited = this.state.visitedElements;
        const staticBlockedTerms = ['back', 'navigate up', 'voltar', 'deletar', 'apagar', 'remover', 'excluir', 'delete', 'remove', 'eliminar', 'borrar'];
        const allBlockedTerms = [...staticBlockedTerms, ...this.state.avoidKeywords.map(k => k.toLowerCase())];

        const unvisitedTargets: InspectorNode[] = [];
        const exploringTargets: InspectorNode[] = [];

        const traverse = (node: InspectorNode) => {
            const isInteractive = node.attributes['clickable'] === 'true' ||
                node.attributes['checkable'] === 'true' ||
                node.attributes['long-clickable'] === 'true' ||
                node.attributes['class']?.includes('EditText') ||
                (node.attributes['focusable'] === 'true' && (!!node.attributes['content-desc'] || !!node.attributes['text']));

            const xpath = generateXPath(node);

            if (isInteractive && xpath && !visited.includes(xpath)) {
                const text = (node.attributes['text'] || '').toLowerCase();
                const desc = (node.attributes['content-desc'] || '').toLowerCase();
                const hasBlockedTerm = allBlockedTerms.some(term => text.includes(term) || desc.includes(term));

                if (!hasBlockedTerm) {
                    const elKey = `${currentScreenName}::${xpath}`;
                    const globalState = this.elementGlobalStates[elKey] ?? GraphState.UNEXPLORED;

                    if (globalState === GraphState.EXPLORING) {
                        exploringTargets.push(node);
                    } else if (globalState === GraphState.UNEXPLORED) {
                        unvisitedTargets.push(node);
                    }
                    // If GraphState.EXHAUSTED, we ignore it
                }
            }

            node.children.forEach(traverse);
        };

        traverse(root);

        // Priority 1: Priority Keywords (Global highest priority across all valid targets)
        // Priority 2: Exploring elements (elements that lead to unexplored screens)
        // Priority 3: Unexplored elements on the current screen
        let unvisitedTarget: InspectorNode | null = null;
        const allTargets = [...exploringTargets, ...unvisitedTargets];

        if (this.state.priorityKeywords.length > 0 && allTargets.length > 0) {
            const keywords = this.state.priorityKeywords.map(k => k.toLowerCase());
            const prioritizedTargets = allTargets.filter(node => {
                const text = ((node.attributes['text'] || '') + ' ' + (node.attributes['content-desc'] || '')).toLowerCase();
                return keywords.some(k => text.includes(k));
            });

            if (prioritizedTargets.length > 0) {
                unvisitedTarget = prioritizedTargets[0];
            }
        }

        if (!unvisitedTarget) {
            const candidates = exploringTargets.length > 0 ? exploringTargets : unvisitedTargets;
            unvisitedTarget = candidates[0] ?? null;
        }

        if (unvisitedTarget) {
            const xpath = generateXPath(unvisitedTarget);
            const isInput = unvisitedTarget.attributes['class']?.includes('EditText');

            if (isInput) {
                return {
                    type: 'type_text',
                    targetId: xpath,
                    text: 'Test',
                    details: 'Heuristic: type text into unvisited input'
                };
            }

            return {
                type: 'click',
                targetId: xpath,
                details: 'Heuristic: click unvisited element'
            };
        }

        // If all elements are visited, try scrolling or going back
        if (this.state.consecutiveSwipes < 2) {
            return {
                type: 'swipe',
                direction: 'up',
                details: 'Heuristic: no unvisited elements, trying to scroll'
            };
        }

        return {
            type: 'back',
            details: 'Heuristic: stuck, going back'
        };
    }

    public getConfig(): ExplorationConfig {
        return {
            priorityKeywords: [...this.state.priorityKeywords],
            avoidKeywords: [...this.state.avoidKeywords],
            revisitKnownScreens: false,
        };
    }

    /**
     * Generates a basic ScreenMap using code heuristics instead of AI.
     */
    public generateHeuristicScreenMap(root: InspectorNode): ScreenMap {
        const elements: UIElementMap[] = [];
        let titleCandidate = "";

        const traverse = (node: InspectorNode) => {
            const isInteractive = node.attributes['clickable'] === 'true' ||
                node.attributes['checkable'] === 'true' ||
                node.attributes['long-clickable'] === 'true' ||
                node.attributes['class']?.includes('EditText') ||
                (node.attributes['focusable'] === 'true' && (!!node.attributes['content-desc'] || !!node.attributes['text'])) ||
                node.attributes['class']?.includes('Button');

            const xpath = generateXPath(node);

            const text = node.attributes['text'] || '';
            const desc = node.attributes['content-desc'] || '';
            const resId = node.attributes['resource-id'] || '';

            // Title detection heuristic (often a large text view at the top, or a Toolbar title)
            let isTitleCandidate = false;
            if (!titleCandidate && text && text.length < 30 && (node.attributes['class']?.includes('TextView') || node.tagName.includes('TextView')) && !isInteractive) {
                // If it's near the top (bounds check could go here if we had bounds, but let's just pick the first prominent text)
                if (text.length > 2) {
                    titleCandidate = text;
                    isTitleCandidate = true;
                }
            }

            // Feedback message detection heuristic
            let isFeedbackCandidate = false;
            if (!isInteractive && text && text.length > 2 && (
                resId.toLowerCase().includes('snackbar') ||
                resId.toLowerCase().includes('message') ||
                resId.toLowerCase().includes('alert') ||
                text.toLowerCase().includes('sucesso') ||
                text.toLowerCase().includes('erro')
            )) {
                isFeedbackCandidate = true;
            }

            if ((isInteractive || isTitleCandidate || isFeedbackCandidate) && xpath) {
                let elementName = text || desc;
                if (!elementName && resId) {
                    elementName = resId.split('/').pop() || 'Element';
                    // clean up snake_case
                    elementName = elementName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                }
                if (!elementName) {
                    elementName = `${node.attributes['class']?.split('.').pop() || 'View'} ${elements.length + 1}`;
                }

                let elType: UIElementMap['type'] = 'button';
                if (!isInteractive) elType = 'text';
                else if (node.attributes['class']?.includes('EditText')) elType = 'input';
                else if (node.attributes['class']?.includes('CheckBox')) elType = 'checkbox';
                else if (node.attributes['class']?.includes('Switch')) elType = 'checkbox'; // use checkbox as fallback for switch
                else if (node.attributes['class']?.includes('Image')) elType = 'image';

                elements.push({
                    id: xpath,
                    name: elementName,
                    type: elType,
                    assertion_target: (!isInteractive && (isTitleCandidate || isFeedbackCandidate)) ? true : undefined
                });
            }

            node.children.forEach(traverse);
        };

        traverse(root);

        // Generate a simple layout hash to differentiate screens if no title is found
        const elementsHash = elements.map(e => e.id).sort().join('|');
        let hash = 0;
        for (let i = 0; i < elementsHash.length; i++) {
            hash = ((hash << 5) - hash) + elementsHash.charCodeAt(i);
            hash |= 0;
        }

        let screenName = titleCandidate ? titleCandidate : `Screen_${Math.abs(hash).toString(16).substring(0, 4)}`;
        // Clean up title
        screenName = screenName.trim();
        const screenId = screenName.toLowerCase().replace(/[^a-z0-9]/g, '_');

        return {
            id: screenId,
            name: screenName,
            type: 'screen', // default heuristic
            description: 'Heuristically generated screen map.',
            elements
        };
    }
}
