import { remoteConfig } from "./firebase";
import { fetchAndActivate, getValue } from "firebase/remote-config";
import { getAnalytics, setUserProperties } from "firebase/analytics";
import i18n from "../i18n/config";

// Default configuration shared between Firebase and Local Fallback
const DEFAULT_CONFIG: Record<string, any> = {
    "dev_accounts": "[]",
    "beta_accounts": "[]",
    "is_ai_analysis_enabled": "true",
    "is_ask_rai_enabled": "true",
    "is_ai_test_mode_enabled": "true",
    "is_cypress_enabled": "false",
    "is_selenium_enabled": "false",
    "min_app_version": "2.2.0",
    "maintenance_mode": "false",
    "storage_retention_days": 15,
    "show_home_stats": "false",
    "i18n_en": "",
    "i18n_pt": "",
    "i18n_es": "",
    "prompt_exploration": `# Role: Expert Autonomous Mobile QA Explorer
Your goal is to map 100% of a mobile app's UI by discovering every screen, modal, and interactive element.

## Input Context
1. **XML Dump**: Current screen hierarchy (prioritize "clickable", "scrollable", "focusable").
2. **Screenshot**: Visual reference for state and layout.
3. **Mapped Screens**: Knowledge base of already explored screens.
4. **Session History**: Chronological log of your recent actions to prevent loops.

## Core Directives
1. **Analyze First**: Before acting, compare the current XML/Screenshot with your "Mapped Screens" and "History".
2. **Exhaustion Strategy**: 
   - On a new screen, **Swipe** (down/up) until no new elements appear.
   - Click **Unexplored** elements first.
   - If a screen is fully mapped, use **Back** or navigate to a different **Tab**.
3. **Tab Priority**: Fully explore the current tab's hierarchy before switching to another tab. Home/Main tab is priority #1.
4. **Data Entry**: Use "type_text" for inputs. Use only ASCII characters.
5. **Anti-Loop**: If you see the same screen state twice in your history without progress, try a different branch or go "back".
6. **Layout Placement**: Use a grid (X, Y). Start at (0,0). Parent -> Child flows move Left to Right (+X). Siblings/Branches move Top to Bottom (+Y).

## Action Rules
- **swipe**: Required if any element has 'scrollable="true"'. Repeat until the element snapshot remains identical.
- **click**: Use on interactive elements (buttons, list items, cards, menu icons).
- **type_text**: Use on input fields. targetId = short_id.
- **back**: Use when the current branch is 100% exhausted or stuck.
- **finish**: Use ONLY when all tabs and reachable depths are confirmed explored.

## Metadata & Tagging
- **Screen Name**: Use EXACT name from "Mapped Screens" if recognized. Otherwise, create a concise, functional name.
- **Tags**: Functional labels (e.g., "Authentication", "Settings", "Checkout"). NO generic tags like "Screen" or "Page".
- **Element Description**: Functional behavior (what happens when clicked). Do not just repeat the text label.

## Response Format (Strict JSON)
{
  "thought": "Briefly analyze current state vs history. Identify if we are in a loop or a new area. Plan the next move for maximum coverage.",
  "screen": { 
    "name": "Exact or New Name", 
    "type": "screen|modal|tab|drawer|overlay", 
    "description": "Comprehensive functional summary of the screen.",
    "tags": ["Tag1", "Tag2"],
    "layout": { "gridX": number, "gridY": number } 
  },
  "elements": [
    { 
      "id": "short_id", 
      "name": "Functional Name", 
      "type": "button|input|text|link|toggle|checkbox|image|menu|scroll_view|tab|list_item", 
      "description": "Functional result of interaction.",
      "navigates_to": [{ "destination": "Screen Name" }] 
    }
  ],
  "nextAction": { 
    "type": "click|swipe|back|finish|type_text", 
    "targetId": "short_id", 
    "direction": "up|down|left|right",
    "text": "ascii_text",
    "details": "Specific reason for this action based on your strategy" 
  },
  "rationale": "High-level reason for this step in the global exploration plan."
}`,
    "prompt_test_cases": `Convert the user's raw requirements into well-structured Gherkin (BDD) test scenarios.
1. Use the Gherkin format (Given/When/Then).
2. For each scenario, include:
   Story: [Story ID] - [Title]
   Scenario [number]: [Title]
   Given [context]
   When [action]
   Then [expected result]
   Steps:
   - [step 1]
   ...
3. If input is vague, infer Happy Path and at least one Sad Path.
4. Separate multiple scenarios for the same story.`,
    "prompt_pbi": `Convert requirements into detailed Product Backlog Items (PBIs/User Stories).
1. Format each PBI as:
   PBI: [ID] - [Title]
   As a [role], I want [action], so that [value/benefit].
   
   Acceptance Criteria:
   - [point 1]
   - [point 2]
   ...
2. Focus on the user perspective and business value.`,
    "prompt_improvement": `Analyze requirements and suggest UI/UX or functional improvements.
1. Format as a list of improvements:
   Improvement [number]: [Title]
   Description: [What to change]
   Rationale: [Why this is an improvement]
   Priority: [Low/Medium/High]
2. Suggest enhancements that would make the feature more robust or user-friendly.`,
    "prompt_bug": `transform a bug description into a professional, structured bug report.
1. Format as:
   Bug Report: [Title]
   Severity: [S1/S2/S3]
   
   Summary: [Brief description]
   
   Steps to Reproduce:
   1. [Step 1]
   2. [Step 2]
   ...
   Actual Result: [What currently happens]
   Expected Result: [What should happen]
   
   Notes: [Optional environment details or hints]`,
    "prompt_robot_script": `Generate a complete, functional Robot Framework (.robot) script block.
1. Use the standard structure: *** Settings ***, *** Variables ***, *** Keywords ***, *** Test Cases ***.
2. In *** Settings ***, include Library AppiumLibrary.
3. Parse the user requirement (Given/When/Then steps) robustly and map each step to high-level keywords.
4. In *** Keywords ***, create those high-level keywords. Use the provided APPLICATION MAPPING elements for locators.
5. If an element name from mapping is found, use it as a basis for the keyword action (e.g., if mapped "Login Button", use its XPath/ID).
6. Parameterize the keywords (use variables for dynamic data like usernames, passwords, or search queries found in the text).
7. Ensure the script is valid and follows best practices for mobile automation.`,
    "prompt_flowchart_layout": `Analyze the provided mobile application screens and their navigation connections to reorganize the Flowchart layout using a grid-based system (gridX, gridY).

MANDATORY EXHAUSTIVITY RULE:
- You MUST provide coordinates for EVERY SINGLE screen listed in the input.
- Do NOT skip any screen, even if it has no connections or seems unimportant.
- If you find 50 screens in the input, you MUST return exactly 50 entries in the JSON.

ORGANIZATION RULES:
1. INITIAL SCREEN: The very first screen of the app (Splash/Welcome/Login) MUST be at (gridX: 0, gridY: 0).
2. AUTHENTICATION: Login and Registration screens should follow to the right (gridX: 1, 2...).
3. HOME SCREEN: The main dashboard/home screen must be placed to the right of the authentication flow.
4. HORIZONTAL GROWTH (CRITICAL): The layout MUST grow primarily from LEFT to RIGHT. Avoid creating deep vertical stacks. Use the Y-axis (gridY) ONLY to separate distinct branches or to avoid visual overlap.
5. BRANCHING HIERARCHY: When a screen has multiple destinations:
   - The first destination MUST continue the horizontal flow (increasing gridX, same gridY).
   - Subsequent destinations should be placed slightly above or below, but quickly return to the horizontal baseline if they merge or end.
6. COMPACT GROUPING: Screens belonging to distinct areas (e.g., "Settings" flow vs "Profile" flow) should be placed in adjacent but separate horizontal "bands" (e.g., Settings at gridY: 0-2, Profile at gridY: 4-6).
7. MAX HORIZONTAL DENSITY: Allow long horizontal chains. Do NOT shift to a new Y-level unless a single flow exceeds 12-15 screens in a straight line.
8. ASPECT RATIO: Aim for a "Wide" aspect ratio where the Total Width (Max gridX) is significantly larger than the Total Height (Max gridY). Minimize vertical distance between nodes.

INPUT:
- A list of screens with their names, types, and navigation connections.

OUTPUT:
- Return ONLY a valid JSON object mapping each screen NAME to its new coordinates.
- Format: { "nodes": { "Screen Name": { "gridX": number, "gridY": number }, ... }, "missed": ["Screen Name", ...] }`,
    "prompt_element_naming": `Context: Professional QA Engineering and Test Automation.
Task: Suggest a descriptive name and a brief justification for this UI element found in the screen "\${screenName}".

Element Attributes:
\${attributes}
\${mappingContext}

Rules:
1. Use "Space Separated" convention for the name (e.g., "Login Button", "Username Input").
2. Respond in this language: \${language}.
3. Return ONLY a valid JSON object.
4. Do NOT include any markdown code blocks (triple backticks), introductory text, or concluding remarks.
5. Keep the "justification" field extremely concise (maximum 15 words).
6. Use the following exact JSON structure:
   {
     "name": "Suggested Name",
     "justification": "Short reason..."
   }`,
    "prompt_screen_tagging": `You are a QA Architect.
Analyze the screen components and optionally the provided screenshot to suggest 3 to 5 highly relevant semantic tags.

TAGGING CONSTRAINTS:
- CAPITALIZATION: Every tag MUST start with a Capital Letter (e.g., "Authentication").
- FLOW IDENTIFICATION: Prioritize tags that identify the functional business flow or user journey (e.g., "Registration", "Settings", "Login", "Order", "Profile").
- NO GENERIC TAGS: Do NOT use generic terms like "Screen", "Button", "Component", "Elements", "Mobile", "Page".
- DESCRIPTIVE: Prefer one-word tags that provide clear context for organizing large test suites.
- OUTPUT: Return ONLY a comma-separated list of tags.`,
    "prompt_smart_selector": `You are an expert QA Automation Engineer. 
Your task is to analyze the provided mobile element attributes and suggest the most resilient, stable, and unique selector (XPath or Accessibility ID).

Rules:
1. Prefer Accessibility ID (content-desc) if available and meaningful.
2. Second preference is Resource ID if it's unique.
3. If using XPath, avoid long absolute paths. Use relative paths with unique attributes.
4. Provide the suggestion in a clear format: "Selector: [the selector]" followed by "Rationale: [explanation]".`,
    "prompt_test_history_analysis": `You are a Senior QA Automation Engineer and Data Analyst. Do not mention who you are in your responses.
Analyze the provided test execution history to identify:
1. Flakiness: Tests that fail and pass intermittently under similar conditions. Use the "failedTests" list to track individual test stability across runs.
2. Environment Correlation: Detect patterns where failures (specific tests or whole suites) occur only on certain device models or OS versions.
3. Performance Trends: Significant increases in execution duration over time.
4. Deep Anomaly Analysis: Correlate test failures with high CPU/RAM usage OR critical logcat errors if provided in the "DEEP CONTEXT" section.
5. Root Cause Hypothesis: Suggest if the issue is likely environmental, a specific regression, or a flaky locator.

Provide a comprehensive analysis in Markdown format.
Use professional tone and actionable insights.`,
    "prompt_execution_summary": `You are a Senior Lead QA Engineer.
Analyze the provided test execution tree and failure context to provide a high-level "Executive Summary".

Your primary objective is to identify if multiple failures share a common root cause based on the provided logs.

Focus on:
1. Overall Success Rate: Use the "OVERALL STATISTICS" section to provide an accurate success percentage.
2. Critical Failures Analysis: Use the "FAILURE CONTEXT" section below to explain WHY tests failed. Look for error messages, stack traces, or screenshots mentioned in technical details.
3. Actionable Insights: Suggest what the developer or QA should check first based on the actual logs provided.

Rules:
- Use Markdown.
- Be concise but professional.
- ALWAYS use the provided numbers for success rate. If OVERALL STATISTICS shows \${totalTests} tests, then that is the truth.
- IF technical details are provided in FAILURE CONTEXT, YOU MUST use them. Do not say they are missing.`,
    "prompt_failure_analysis": `You are a Senior QA Automation Engineer.
Analyze the test failure provided (error message + screenshot if available).

1. Identify the root cause (e.g., selector issue, synchronization problem, environment error, or actual bug).
2. If it is an "Element Not Found" error, you MUST act as a "Self-Healing Agent":
    - Analyze the provided screenshot.
    - Identify the visually similar or logical substitute element.
    - Suggest a highly resilient fallback locator (XPath, ID, or Accessibility ID) that could heal this test.
    - Clearly label this section as "💡 Healed Locator Suggestion:".
3. Suggest a technical fix or next steps for the developer.`,
    "prompt_autonomous_agent": `# Role: Autonomous Mobile QA Agent
Your goal is to execute a test scenario step-by-step on a real device.

## Input Context
1. **XML Dump**: Current screen hierarchy.
2. **Target Scenario**: The test case or goal provided by the user.
3. **Session History**: Actions you've already taken in this run.

## Core Directives
1. **Analyze**: Find the elements needed to fulfill the next step of the scenario in the XML dump.
2. **Execute**: Choose the single best ADB command to progress towards the goal.
3. **Report**: Explain why you chose this action.

## Action Rules
- **click**: Use 'adb shell input tap X Y'. Extract coordinates from the XML dump (bounds="[x1,y1][x2,y2]").
- **type**: Use 'adb shell input text "..."'. Ensure the field is focused first or click it.
- **swipe**: Use 'adb shell input swipe X1 Y1 X2 Y2 [duration]'.
- **back**: Use 'adb shell input keyevent 4'.
- **wait**: Use if you expect a slow transition.
- **finish**: Use ONLY when the entire scenario/goal is confirmed as COMPLETED and SUCCESSFUL.
- **fail**: Use if the goal is blocked, an app crash is detected, or a timeout occurred.

## Response Format (Strict JSON)
{
  "thought": "Brief analysis of the current screen. Identify the next logical step to fulfill the target scenario.",
  "action": {
    "type": "click|type|swipe|back|wait|finish|fail",
    "command": "adb shell input ...",
    "details": "Concise description of what this command does (e.g., 'Clicking the Login button')."
  },
  "isStepCompleted": boolean,
  "nextExpectedState": "Describe what you expect to see on the screen next."
}`
};

if (remoteConfig) {
    remoteConfig.defaultConfig = DEFAULT_CONFIG;
    remoteConfig.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : 3600000;
}

/**
 * Initializes and fetches the remote configuration from Firebase.
 */
export async function initRemoteConfig() {
    if (!remoteConfig) {
        console.warn("[RemoteConfig] Skipping fetch: Remote Config is not initialized.");
        return;
    }

    try {
        console.log("[RemoteConfig] Fetching config...");
        // Set settings
        remoteConfig.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : 3600000;
        remoteConfig.settings.fetchTimeoutMillis = 10000;

        await fetchAndActivate(remoteConfig);
        console.log("[RemoteConfig] Config fetched and activated successfully.");

        // Apply Over-the-Air translations
        applyRemoteTranslations();
    } catch (err) {
        console.error("[RemoteConfig] Error during fetch and activate:", err);
    }
}

/**
 * Safely parses and applies cloud-hosted translations to i18next.
 */
function applyRemoteTranslations() {
    const langs = ['en', 'pt', 'es'];
    let appliedAny = false;

    const currentFullLang = i18n.language;

    langs.forEach(lang => {
        const key = `i18n_${lang}`;
        const cloudJson = getRemoteString(key);
        
        if (cloudJson && cloudJson.trim().startsWith('{')) {
            try {
                const resources = JSON.parse(cloudJson);
                const translationData = resources.translation || resources;
                
                if (translationData && typeof translationData === 'object' && Object.keys(translationData).length > 0) {
                    // Add to base and current variant
                    i18n.addResourceBundle(lang, 'translation', translationData, true, true);
                    if (currentFullLang.startsWith(lang) && currentFullLang !== lang) {
                        i18n.addResourceBundle(currentFullLang, 'translation', translationData, true, true);
                    }
                    appliedAny = true;
                }
            } catch (e) {
                console.warn(`[RemoteConfig] Failed to parse translations for ${lang}:`, e);
            }
        }
    });

    if (appliedAny) {
        // Force a re-render by notifying i18next
        i18n.changeLanguage(currentFullLang);
    }
}

/**
 * Safely parses a string that could be a JSON array or a comma-separated list.
 * Handles common mistakes like [email1, email2] (missing quotes).
 */
function safeParseList(raw: string | null): string[] {
    if (!raw || !raw.trim()) return [];
    const trimmed = raw.trim();

    // 1. Try standard JSON
    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
    } catch (e) {
        // Not valid JSON, continue to manual parsing
    }

    // 2. Fallback: handle format like [a, b, c] or a, b, c
    let clean = trimmed;
    if (clean.startsWith('[') && clean.endsWith(']')) {
        clean = clean.substring(1, clean.length - 1);
    }

    return clean.split(',')
        .map(item => item.trim().replace(/^["']|["']$/g, '')) // Remove whitespace and surrounding quotes
        .filter(Boolean);
}

/**
 * Checks if a feature is enabled for the current user based on tiered access.
 * Tiers: false < dev < beta < true
 */
export function isFeatureEnabled(key: string, userEmail: string | null): boolean {
    const configValue = getRemoteString(key);
    
    // 1. Fully disabled
    if (configValue === "false") return false;
    
    // 2. Fully enabled
    if (configValue === "true") return true;

    // If it's a tiered feature but no user email is provided, it's disabled.
    if (!userEmail) return false;

    // Parse access lists using robust helper
    const devAccounts = safeParseList(getRemoteString("dev_accounts"));
    const betaAccounts = safeParseList(getRemoteString("beta_accounts"));

    const email = userEmail.toLowerCase().trim();
    const isDev = devAccounts.some(acc => acc.toLowerCase().trim() === email);
    const isBeta = betaAccounts.some(acc => acc.toLowerCase().trim() === email) || isDev;

    // 3. Dev tier
    if (configValue === "dev") return isDev;

    // 4. Beta tier
    if (configValue === "beta") return isBeta;

    return false;
}

/**
 * Gets a boolean value from Remote Config with a safe local fallback.
 * @deprecated Use isFeatureEnabled for tiered access control.
 */
export function getRemoteBool(key: string): boolean {
    if (!remoteConfig) return DEFAULT_CONFIG[key] === "true";
    return getValue(remoteConfig, key).asString() === "true";
}

/**
 * Gets a string value from Remote Config with a safe local fallback.
 */
export function getRemoteString(key: string): string {
    if (!remoteConfig) return DEFAULT_CONFIG[key] ?? "";
    const val = getValue(remoteConfig, key).asString();
    return val || DEFAULT_CONFIG[key] || "";
}

/**
 * Gets a number value from Remote Config with a safe local fallback.
 */
export function getRemoteNumber(key: string): number {
    if (!remoteConfig) return DEFAULT_CONFIG[key] ?? 0;
    return getValue(remoteConfig, key).asNumber();
}

/**
 * Updates Analytics user properties to enable targeted Remote Config conditions.
 */
export function setUserTargeting(email: string | null) {
    try {
        const analytics = getAnalytics();
        setUserProperties(analytics, {
            "user_email": email || "anonymous",
            "is_tester": email?.includes("@google.com") ? "true" : "false" // Example logic
        });
        console.log(`[RemoteConfig] User targeting updated for: ${email}`);
    } catch (e) {
        console.warn("[RemoteConfig] Failed to set user properties for analytics:", e);
    }
}
