import { ScreenMap } from '@/lib/types';

export interface ExplorationState {
    visitedScreens: string[]; // Screen names
    visitedElements: string[]; // Element IDs (XPath or Resource-ID)
    logs: string[];
    maxSteps: number;
    currentStep: number;
    targetPackage?: string;
}

export interface ExplorationAction {
    type: 'click' | 'back' | 'swipe' | 'finish' | 'error';
    targetId?: string;
    direction?: 'up' | 'down' | 'left' | 'right';
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

    public setTargetPackage(pkg: string) {
        this.state.targetPackage = pkg;
        this.addLog(`Target package identified: ${pkg}`);
    }

    public getTargetPackage(): string | undefined {
        return this.state.targetPackage;
    }

    public shouldStop(): boolean {
        // Now mostly controlled by AI 'finish' action or manual stop, 
        // but we keep a safety limit.
        return this.state.currentStep >= this.state.maxSteps;
    }

    public getLogs(): string[] {
        return this.state.logs;
    }

    public getState(): ExplorationState {
        return { ...this.state };
    }
}
