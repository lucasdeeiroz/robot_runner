import { ScreenMap, NavigationData } from '@/lib/types';

/**
 * Appends a custom prompt instruction to the end of the original prompt if provided.
 */
export function appendCustomPrompt(basePrompt: string, customPrompt?: string): string {
  if (!customPrompt || customPrompt.trim().length === 0) return basePrompt;
  return `${basePrompt}\n\n=== CUSTOM INSTRUCTIONS ===\n${customPrompt}\n\nNote: The custom instructions above must take precedence and OVERRIDE any conflicting rules defined previously.`;
}

/**
 * Generates a rich summary of existing mapped screens for AI context.
 * Includes description, element names, and navigation connections so the AI
 * can make informed decisions about what has already been explored.
 */
export function formatExistingMaps(maps: ScreenMap[]): string {
  if (maps.length === 0) return '(No screens mapped yet)';

  return maps.map(m => {
    const lines: string[] = [];
    lines.push(`- Screen: "${m.name}" (${m.type})${m.description ? ` — ${m.description}` : ''}`);

    if (m.elements.length > 0) {
      const elementSummaries = m.elements.map(el => {
        let summary = `    · ${el.name} [${el.type}]`;
        // Show navigation destinations
        if (el.navigates_to) {
          const dest = typeof el.navigates_to === 'string'
            ? el.navigates_to
            : Array.isArray(el.navigates_to)
              ? el.navigates_to.map(n => n.destination).join(', ')
              : (el.navigates_to as NavigationData).destination;
          if (dest) summary += ` → ${dest}`;
        }
        return summary;
      });
      lines.push(`  Elements (${m.elements.length}):`);
      lines.push(...elementSummaries);
    }

    return lines.join('\n');
  }).join('\n');
}

export function getExplorationPrompt(language: string, customPrompt?: string): string {
  const basePrompt = `
# Role: Expert Autonomous Mobile QA Explorer
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
}

Respond in ${language}. Ensure JSON is valid and contains NO backticks or extra text.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

export function getRefinedTestCasesPrompt(language: string, customPrompt?: string): string {
  const basePrompt = `
Convert the user's raw requirements into well-structured Gherkin (BDD) test scenarios.
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
4. Separate multiple scenarios for the same story.
5. Language: ${language}.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

export function getRefinedPBIPrompt(language: string, customPrompt?: string): string {
  const basePrompt = `
Convert requirements into detailed Product Backlog Items (PBIs/User Stories).
1. Format each PBI as:
   PBI: [ID] - [Title]
   As a [role], I want [action], so that [value/benefit].
   
   Acceptance Criteria:
   - [point 1]
   - [point 2]
   ...
2. Focus on the user perspective and business value.
3. Language: ${language}.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

export function getRefinedImprovementPrompt(language: string, customPrompt?: string): string {
  const basePrompt = `
Analyze requirements and suggest UI/UX or functional improvements.
1. Format as a list of improvements:
   Improvement [number]: [Title]
   Description: [What to change]
   Rationale: [Why this is an improvement]
   Priority: [Low/Medium/High]
2. Suggest enhancements that would make the feature more robust or user-friendly.
3. Language: ${language}.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

export function getRefinedBugPrompt(language: string, customPrompt?: string): string {
  const basePrompt = `
transform a bug description into a professional, structured bug report.
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
   
   Notes: [Optional environment details or hints]
2. Language: ${language}.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

export function getRefinedRobotScriptPrompt(language: string, customPrompt?: string): string {
  const basePrompt = `
Generate a complete, functional Robot Framework (.robot) script block.
1. Use the standard structure: *** Settings ***, *** Variables ***, *** Keywords ***, *** Test Cases ***.
2. In *** Settings ***, include Library AppiumLibrary.
3. Parse the user requirement (Given/When/Then steps) robustly and map each step to high-level keywords.
4. In *** Keywords ***, create those high-level keywords. Use the provided APPLICATION MAPPING elements for locators.
5. If an element name from mapping is found, use it as a basis for the keyword action (e.g., if mapped "Login Button", use its XPath/ID).
6. Parameterize the keywords (use variables for dynamic data like usernames, passwords, or search queries found in the text).
7. Ensure the script is valid and follows best practices for mobile automation.
8. Language: ${language}.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

/**
 * Prompt specifically for reorganizing the flowchart layout.
 */
export function getFlowchartLayoutPrompt(language: string, customPrompt?: string): string {
  const basePrompt = `
Analyze the provided mobile application screens and their navigation connections to reorganize the Flowchart layout using a grid-based system (gridX, gridY).

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
- Format: { "nodes": { "Screen Name": { "gridX": number, "gridY": number }, ... }, "missed": ["Screen Name", ...] }

Language for any required internal reasoning: ${language}.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

/**
 * Prompt for suggesting a name and justification for a UI element.
 */
export function getElementNamingPrompt(
  screenName: string,
  elementAttr: Record<string, string>,
  language: string,
  mappingContext: string,
  customPrompt?: string
): string {
  const attributes = Object.entries(elementAttr)
    .filter(([_, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const basePrompt = `
Context: Professional QA Engineering and Test Automation.
Task: Suggest a descriptive name and a brief justification for this UI element found in the screen "${screenName}".

Element Attributes:
${attributes}
${mappingContext}

Rules:
1. Use "Space Separated" convention for the name (e.g., "Login Button", "Username Input").
2. Respond in this language: ${language}.
3. Return ONLY a valid JSON object.
4. Do NOT include any markdown code blocks (triple backticks), introductory text, or concluding remarks.
5. Keep the "justification" field extremely concise (maximum 15 words).
6. Use the following exact JSON structure:
   {
     "name": "Suggested Name",
     "justification": "Short reason..."
   }
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

/**
 * System instruction for suggesting semantic tags for a screen.
 */
export function getScreenTaggingPrompt(language: string, customPrompt?: string): string {
  const basePrompt = `
You are a QA Architect.
Analyze the screen components and optionally the provided screenshot to suggest 3 to 5 highly relevant semantic tags.

TAGGING CONSTRAINTS:
- CAPITALIZATION: Every tag MUST start with a Capital Letter (e.g., "Authentication").
- FLOW IDENTIFICATION: Prioritize tags that identify the functional business flow or user journey (e.g., "Registration", "Settings", "Login", "Order", "Profile").
- NO GENERIC TAGS: Do NOT use generic terms like "Screen", "Button", "Component", "Elements", "Mobile", "Page".
- DESCRIPTIVE: Prefer one-word tags that provide clear context for organizing large test suites.
- OUTPUT: Return ONLY a comma-separated list of tags.

Language: ${language}.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

/**
 * Prompt for the Smart Selector Suggester in the Inspector.
 */
export function getSmartSelectorPrompt(language: string, customPrompt?: string): string {
  const basePrompt = `
You are an expert QA Automation Engineer. 
Your task is to analyze the provided mobile element attributes and suggest the most resilient, stable, and unique selector (XPath or Accessibility ID).

Rules:
1. Prefer Accessibility ID (content-desc) if available and meaningful.
2. Second preference is Resource ID if it's unique.
3. If using XPath, avoid long absolute paths. Use relative paths with unique attributes.
4. Provide the suggestion in a clear format: "Selector: [the selector]" followed by "Rationale: [explanation]".
5. Provide the Rationale in the requested language: ${language}.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}


/**
 * System instruction for analyzing test history.
 */
export function getTestHistoryAnalysisPrompt(language: string, customPrompt?: string): string {
  const responseLanguage = language.toLowerCase().startsWith('pt') ? 'Portuguese' : language.toLowerCase().startsWith('es') ? 'Spanish' : 'English';

  const basePrompt = `
You are a Senior QA Automation Engineer and Data Analyst. Do not mention who you are in your responses.
Analyze the provided test execution history to identify:
1. Flakiness: Tests that fail and pass intermittently under similar conditions. Use the "failedTests" list to track individual test stability across runs.
2. Environment Correlation: Detect patterns where failures (specific tests or whole suites) occur only on certain device models or OS versions.
3. Performance Trends: Significant increases in execution duration over time.
4. Deep Anomaly Analysis: Correlate test failures with high CPU/RAM usage OR critical logcat errors if provided in the "DEEP CONTEXT" section.
5. Root Cause Hypothesis: Suggest if the issue is likely environmental, a specific regression, or a flaky locator.

Provide a comprehensive analysis in Markdown format.
Use professional tone and actionable insights.
Response language: ${responseLanguage}.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

/**
 * System instruction for summarizing test execution results.
 */
export function getExecutionSummaryPrompt(language: string, totalTests: number, customPrompt?: string): string {
  const responseLanguage = language.toLowerCase().startsWith('pt') ? 'Portuguese' : language.toLowerCase().startsWith('es') ? 'Spanish' : 'English';

  const basePrompt = `
You are a Senior Lead QA Engineer.
Analyze the provided test execution tree and failure context to provide a high-level "Executive Summary".

Your primary objective is to identify if multiple failures share a common root cause based on the provided logs.

Focus on:
1. Overall Success Rate: Use the "OVERALL STATISTICS" section to provide an accurate success percentage.
2. Critical Failures Analysis: Use the "FAILURE CONTEXT" section below to explain WHY tests failed. Look for error messages, stack traces, or screenshots mentioned in technical details.
3. Actionable Insights: Suggest what the developer or QA should check first based on the actual logs provided.

Rules:
- Use Markdown.
- Be concise but professional.
- ALWAYS use the provided numbers for success rate. If OVERALL STATISTICS shows ${totalTests} tests, then that is the truth.
- IF technical details are provided in FAILURE CONTEXT, YOU MUST use them. Do not say they are missing.
- Response language: ${responseLanguage}.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

/**
 * Prompt for root cause analysis and self-healing in the Log Tree.
 */
export function getFailureAnalysisPrompt(language: string, customPrompt?: string): string {
  const basePrompt = `
You are a Senior QA Automation Engineer.
Analyze the test failure provided (error message + screenshot if available).

1. Identify the root cause (e.g., selector issue, synchronization problem, environment error, or actual bug).
2. If it is an "Element Not Found" error, you MUST act as a "Self-Healing Agent":
    - Analyze the provided screenshot.
    - Identify the visually similar or logical substitute element.
    - Suggest a highly resilient fallback locator (XPath, ID, or Accessibility ID) that could heal this test.
    - Clearly label this section as "💡 Healed Locator Suggestion:".
3. Suggest a technical fix or next steps for the developer.

Respond in ${language}. Keep it concise and technical.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

/**
 * Standardizes the "Senior QA Specialist" wrapper for refined test cases.
 */
export function getQAAssistantWrapper(promptString: string, appMapping: boolean, mappingContext: string, customPrompt?: string): string {
  const basePrompt = `
You are a Senior QA Specialist and Product Owner assistant.

${promptString}

RULES:
1. Output ONLY the raw content without markdown code blocks, headers, or introductory text.
2. Keep the content professional, concise, and technically accurate.
3. ${appMapping ? "PRIORITIZE using the names and screens provided in the APPLICATION MAPPING context below. If a requirement mentions an action that matches a mapped element, use that element's specific name." : "Use generic but clear terminology."}
${mappingContext}
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}

/**
 * Prompt for the Autonomous QA Agent (Phase 3).
 * Focuses on executing a specific scenario step-by-step using ADB.
 */
export function getAutonomousAgentPrompt(language: string, customPrompt?: string): string {
  const basePrompt = `
# Role: Autonomous Mobile QA Agent
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
}

Respond in ${language}. Ensure the JSON is valid and contains NO markdown backticks or extra text.
`.trim();
  return appendCustomPrompt(basePrompt, customPrompt);
}