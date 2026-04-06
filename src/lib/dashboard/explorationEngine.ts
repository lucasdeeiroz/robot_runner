import { ScreenMap } from '@/lib/types';

export interface ExplorationState {
    visitedScreens: string[]; // Screen names
    visitedElements: string[]; // Element IDs (XPath or Resource-ID)
    logs: string[];
    maxSteps: number;
    currentStep: number;
    targetPackage?: string;
    consecutiveSwipes: number;
    previousElementsSnapshot?: string;
    screenVisitCount: Record<string, number>; // Track how many times each screen was visited
    actionFingerprints: Record<string, number>; // Track repeated screen:action:target combos
    // Back-update tracking: what was the last navigation that brought us here?
    previousScreenName?: string;
    previousActionTargetId?: string; // short_id of the element clicked on the previous screen
    previousActionType?: string; // type of action (click, etc.)
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
}

/**
 * Utility to manage the autonomous exploration session state.
 */
export class AutonomousExplorer {
    private state: ExplorationState;

    constructor(initialMaxSteps: number = 9999) {
        this.state = {
            visitedScreens: [],
            visitedElements: [],
            logs: [],
            maxSteps: initialMaxSteps,
            currentStep: 0,
            consecutiveSwipes: 0,
            screenVisitCount: {},
            actionFingerprints: {},
        };
    }

    public addLog(message: string) {
        const timestamp = new Date().toLocaleTimeString();
        this.state.logs.push(`[${timestamp}] ${message}`);
        console.log(`[Exploration] ${message}`);
    }

    public isAlreadyVisited(screenName: string): boolean {
        return this.state.visitedScreens.includes(screenName);
    }

    public markScreenVisited(screenName: string) {
        if (!this.state.visitedScreens.includes(screenName)) {
            this.state.visitedScreens.push(screenName);
            this.addLog(`Mapped new screen: ${screenName}`);
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
        this.addLog(`Target package identified: ${pkg}`);
    }

    public getTargetPackage(): string | undefined {
        return this.state.targetPackage;
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

    public getLogs(): string[] {
        return this.state.logs;
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
}
