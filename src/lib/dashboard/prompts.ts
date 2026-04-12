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
You are an Autonomous QA Mobile App Exploration Bot.
Your mission is to explore and map a mobile application's UI as DEEPLY and COMPREHENSIVELY as possible.

INPUTS:
1. XML DUMP: The current screen's UI hierarchy.
2. SCREENSHOT: Visual context.
3. EXISTING MAPS: Screens already mapped (with element counts).
4. SESSION HISTORY: Actions already taken in this session.

YOUR TASKS:
1. IDENTIFY THE SCREEN: Give it a descriptive name, type (screen, modal, tab, drawer, overlay), and tags.
2. MAP ALL ELEMENTS: List ALL interactive elements from the XML. Assign a name, type, description, and navigation destination if inferable.
3. MAP ALL SCREENS: Identify the best way to map all screens. If you identify there are tabs, map one tab at a time, exploring all its elements and flows before moving to the next tab.
4. DETECT SCROLLABLE AREAS: Look for 'scrollable="true"' or classes like 'ScrollView', 'ListView', 'RecyclerView' in the XML.
   - If ANY scrollable container exists on screen, you MUST use "swipe" action on it BEFORE clicking any element.
   - The "targetId" for swipe MUST be the "short_id" of the scrollable container itself.
   - Swipe "down" first to reveal content below, then "up" if needed.
5. FLOWCHART PLACEMENT: Suggest a "layout" { "gridX": number, "gridY": number } for the screen.
   - Initial screen is (0, 0). New screens go to the nearest UNIQUE empty grid coordinate.
   - Home screen should be placed to the right of Initial Screen and login screens, if there are any.
   - Place screen following the flow of the app, if there is a tab bar, place the screens in the order of the tabs.
   - The flows must be from left to right. Branches of a flow must be placed below the screen that originates them.
6. DECIDE NEXT ACTION: Pick ONE action (see STRATEGY below).

EXPLORATION STRATEGY (CRITICAL — follow strictly):
- HOME SCREEN PRIORIZATION: The Home Screen is the most crucial screen to explore, you MUST fully explore it before switching to any other tab and click all the elements on the home screen to fully map it.
- CURRENT TAB FIRST: The screen you see when the app opens is the FIRST tab. You MUST fully explore it before switching to any other tab. Do NOT click on other tabs in the navigation bar until every element on the current tab has been explored.
- FULL SCROLL FIRST: On EVERY new screen, if scrollable containers exist, swipe repeatedly until no new elements appear. Only after fully scrolling should you start clicking elements.
- CLICK EVERY ITEM: After scrolling, you must click on EVERY interactive element on the screen — including list items, cards, icons, and menu options — to discover sub-screens. Do NOT assume an element has no sub-screen; always click to verify.
- DEPTH-FIRST: Click into the FIRST unexplored interactive element on the current screen. Go deeper until you hit a dead-end, then "back" and try the next element.
- EXHAUST BEFORE LEAVING: Do NOT navigate away from a screen if you haven't clicked every interactive element on it. Check EXISTING MAPS and SESSION HISTORY to verify which elements you already explored.
- TAB ORDER: Only after you have explored ALL elements and sub-screens reachable from the current tab, navigate to the NEXT tab in the navigation bar.
- After returning via "back", pick the NEXT unexplored element on the current screen.
- "finish" ONLY when ALL tabs and ALL reachable screens have been fully explored.

TEXT INPUT RULES:
- MANDATORY: If a screen has an input field that must be filled to proceed, use "type_text" action.
- MANDATORY: nextAction.text MUST be ASCII-only (English letters, numbers, spaces). Do NOT use accented characters (ã, ç, é, etc.). Example: "Test Routine", "user@test.com", "123456".
- MANDATORY: Set nextAction.targetId to the input field's short_id.
- MANDATORY: If you already clicked an input field in the previous step and it's still empty, use "type_text" immediately.

SWIPE RULES:
- MANDATORY: On every new screen, if ANY element has scrollable="true" or is a ScrollView/ListView/RecyclerView, you MUST swipe BEFORE clicking anything.
- MANDATORY: Keep swiping in the same direction on consecutive steps while new elements are being discovered. Compare the current elements with the ones from the previous step — if they are the same, stop swiping and start clicking. Otherwise, keep swiping.
- MANDATORY: Set nextAction.type to "swipe", targetId to the scrollable container's short_id, direction to "down".
- MANDATORY: After each swipe, re-analyze the screen to map newly visible elements. If new elements appeared, swipe AGAIN.
- MANDATORY: Only after swiping produces no new elements should you begin clicking on the mapped elements.

ANTI-LOOP & PERSISTENCE RULES:
- NEVER click the same element twice. Cross-reference with SESSION HISTORY.
- MANDATORY: If you return to a screen you've been on before, pick a DIFFERENT element than any previously clicked.
- MANDATORY: If a screen requires text input, use "type_text". Do NOT go "back" and return repeatedly.
- MANDATORY: NEVER "remove" elements from the elements list if they were present in EXISTING MAPS. If an element was there before, keep it in your output. You are APPENDING knowledge, not replacing it.

NOTES (Maintenance of Memory & Context):
- INCORPORATE & REWRITE: You are responsible for the continuity of descriptions. Read the "description" from EXISTING MAPS, incorporate your new findings into it fluently, and return the COMPLETE new description. 
- DO NOT REMOVE: Retain all previous context and observations unless they are directly contradicted or proven false by the current screen state.
- VALUE OVER NOISE: Do NOT repeat the element's visible text or name as the description. Add behavior, state, and findings.
- IF NO NEWS: If you have no new observations, return the existing description as-is.

GENERAL RULES:
1. Element names: "Space Separated" (e.g. "Login Button").
2. Element "type": one of button, input, text, link, toggle, checkbox, image, menu, scroll_view, tab, list_item.
3. The "id" field in "elements" MUST be the "short_id" from the XML.
4. Screen Recognition: If XML/Screenshot matches an existing mapped screen, reuse its exact name.
5. Language for descriptions and rationale: ${language}.
6. Map ALL visible elements, not just clickable ones. 
   - SCROLLABLE: Elements with scrollable="true" (generic View, ScrollView, ListView, etc.) MUST be mapped as "scroll_view". They are targets for swiping.
   - IMAGES: ImageView nodes with content-desc are important context and must be mapped as "image".
   - CONTEXT: Focusable=true or enabled=true nodes provide cues about screen state and should be mapped even if clickable=false.
7. ELEMENT PERSISTENCE: You must include ALL elements that are currently visible on the screen. If an element was previously mapped elsewhere but is NOT visible now, simply omit it from your 'elements' array (the system will merge it automatically). Do NOT attempt to "delete" elements by sending an empty list.
8. DESCRIPTION REWRITE: You must return the FULL, cohesive description for the screen and elements. Incorporate new findings into the existing text provided in "EXISTING MAPS". Do NOT use separators like "|" or "---". Write one single flowing descriptive text.
9. SCREEN MATCHING: Use EXACT names from the PROVIDED CONTEXT "EXISTING MAPS" for existing screens. Do NOT normalize or change capitalization if it's already there.

JSON STRUCTURE:
{
  "screen": { 
    "name": "...", 
    "type": "screen|modal|tab|drawer|overlay", 
    "description": "...",
    "tags": ["tag1", ...],
    "layout": { "gridX": number, "gridY": number } 
  },
  "elements": [
    { 
      "id": "short_id", 
      "name": "...", 
      "type": "...", 
      "description": "...",
      "android_id": "...", 
      "accessibility_id": "...", 
      "text": "...", 
      "navigates_to": [
        {
          "destination": "Next Screen Name",
          "sourceHandle": "...",
          "targetHandle": "...",
          "vertices": [
            {
              "x": number,
              "y": number
            }
          ]
        }
      ]
    }
  ],
  "nextAction": { 
    "type": "click|swipe|back|finish|type_text", 
    "targetId": "short_id", 
    "direction": "up|down|left|right",
    "text": "text to type (for type_text action)",
    "details": "reason" 
  },
  "rationale": "..."
}
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
3. In *** Keywords ***, create high-level keywords based on the user requirement. Use the provided APPLICATION MAPPING elements for locators.
4. If an element name from mapping is found, use it as a basis for the keyword action (e.g., if mapped "Login Button", use its XPath/ID).
5. Ensure the script is valid and follows best practices for mobile automation.
6. Language: ${language}.
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
4. VERTICAL SPREADING (CRITICAL): Do NOT place all screens in a single horizontal line. If multiple screens originate from the same parent (like different tabs from Home), they MUST be distributed vertically (different gridY values).
5. BRANCHING HIERARCHY: When a screen has multiple destinations:
   - The first destination continues the horizontal flow (same gridY, increasing gridX).
   - Subsequent destinations MUST be placed below (increasing gridY) the first one, creating a clear tree structure.
6. FUNCTIONAL GROUPING: Screens belonging to distinct areas (e.g., "Settings" flow vs "Profile" flow) should be placed in entirely different Y-sectors (e.g., Settings at gridY: 0-5, Profile at gridY: 10-15) to maintain visual separation.
7. MAX HORIZONTAL DENSITY: Avoid long horizontal chains. If a flow exceeds 5 screens in a straight line, consider indenting or shifting the Y-level for the next segment if it helps readability.
8. CLARITY: Minimize overlapping connection lines. Prioritize a clean, hierarchical tree structure that grows primarily from LEFT to RIGHT and spreads TOP to BOTTOM.

INPUT:
- A list of screens with their names, types, and navigation connections.

OUTPUT:
- Return ONLY a valid JSON object mapping each screen NAME to its new coordinates.
- Format: { "Screen Name": { "gridX": number, "gridY": number }, ... }

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
Tags should be dynamic, context-aware, and useful for organizing a large test suite.
Examples: "Authentication", "User Profile", "Social Media", "Shopping Cart", "Form Validation".
Respond ONLY in a comma-separated list of tags in this language: ${language}.
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