import { ScreenMap, NavigationData } from '@/lib/types';
import { getRemoteString } from '../remoteConfig';
import type { ExplorationConfig } from './explorationEngine';
import { getDestructiveTerms } from './explorationEngine';

/**
 * System prompt for the lightweight pre-analysis step that runs before the DFS starts.
 * The model must return ONLY a JSON object — no markdown, no prose.
 */
export function getExplorationInitPrompt(): string {
  return getRemoteString('prompt_exploration_init') || `You are a mobile QA exploration analyzer. Parse the user's exploration goal and extract session constraints.

Return ONLY a valid JSON object — no markdown, no backticks, no explanation, no extra text:
{
  "priorityKeywords": ["keyword1", "keyword2"],
  "avoidKeywords":    ["keyword1", "keyword2"],
  "escapeTargets":    ["keyword1", "keyword2"],
  "revisitKnownScreens": false,
  "forceReexplore": ["screenName1", "screenName2"]
}

Rules:
- priorityKeywords: short words/phrases (≤3 words) whose presence in an element's text or description marks it as high-priority to explore first.
- avoidKeywords: short words/phrases that identify elements/sections to skip (destructive actions or out-of-scope areas).
- escapeTargets: short words/phrases that identify "back" or "cancel" buttons to escape a screen.
- revisitKnownScreens: true ONLY if the user explicitly asks to re-map or re-explore EVERYTHING from scratch.
- forceReexplore: array of screen names or sections the user explicitly asked to re-explore (e.g., "Explore the Profile again"). This will bypass the exhaustion check for specific screens.
- If no constraints apply, return empty arrays and false.

Examples:
User: "Explore the payment flow with Pix. Don't touch account settings."
Response: {"priorityKeywords":["payment","pix","pagamento"],"avoidKeywords":["account settings","configurações de conta"],"escapeTargets":[],"revisitKnownScreens":false,"forceReexplore":[]}

User: "Re-map everything from scratch"
Response: {"priorityKeywords":[],"avoidKeywords":[],"escapeTargets":[],"revisitKnownScreens":true,"forceReexplore":[]}

User: "Acesse o Carrinho de compras e explore ele de novo para achar novos botões"
Response: {"priorityKeywords":["carrinho","cart"],"avoidKeywords":[],"escapeTargets":[],"revisitKnownScreens":false,"forceReexplore":["carrinho"]}`;
}

/**
 * Builds a "## Session Constraints" block from an ExplorationConfig to inject into custom prompts.
 * Returns an empty string when both keyword arrays are empty.
 */
export function buildExplorationConstraints(config: ExplorationConfig): string {
  const lines: string[] = [];
  if (config.priorityKeywords.length > 0) {
    lines.push(`- Priority elements (explore first): ${config.priorityKeywords.join(', ')}`);
  }

  const allAvoidKeywords = Array.from(new Set([...config.avoidKeywords, ...getDestructiveTerms()]));
  if (allAvoidKeywords.length > 0) {
    lines.push(`- Avoid clicking elements with: ${allAvoidKeywords.join(', ')}`);
  }
  if (lines.length === 0) return '';
  return `\n\n## Session Constraints\n${lines.join('\n')}`;
}

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
        if (el.assertion_target) summary += ` (Assert Target)`;
        if (el.expected_data) summary += ` (Mock: ${el.expected_data})`;
        if (el.business_rule) summary += ` (Rule: ${el.business_rule})`;
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
  const basePrompt = getRemoteString('prompt_exploration') || `
# Role: Expert Autonomous Mobile QA Explorer
Your goal is to map 100% of a mobile app's UI by discovering every screen, modal, and interactive element.

## Input Context
1. **Simplified XML Dump**: Current screen hierarchy of key interactive elements. Attributes:
   - \`id\`: Short identifier (e.g., "e1", "e2"). Use this as the \`targetId\` in your nextAction.
   - \`res\`: Resource-ID suffix of the element.
   - \`text\`: Visible text on the element.
   - \`desc\`: Accessibility content description of the element (critical for non-text buttons).
   - \`bounds\`: Coordinate bounds of the element \`[x1,y1][x2,y2]\`.
   - Interactive states like \`clickable\`, \`scrollable\`, \`checkable\`, \`checked\`, \`selected\`.
2. **Screenshot**: Visual reference for state and layout.
3. **Mapped Screens**: Knowledge base of already explored screens.
4. **Session History**: Chronological log of your recent actions to prevent loops.

## Core Directives
1. **Analyze First**: Before acting, compare the current XML/Screenshot with your "Mapped Screens" and "History". Cross-reference the \`bounds\` in the XML with the visual elements in the screenshot.
2. **Exhaustion Strategy**: 
   - On a new screen, **Swipe** (down/up) if scrollable elements exist, until no new elements appear.
   - Click **Unexplored** elements first.
   - If a button that would navigate to next screen is disabled, analyze the screen to discover what action would enable it.
   - If a screen is fully mapped, prefer clicking "Save", "Finish", "Confirm", "Next" or similar buttons to escape, if they are non-destructive actions. If there are no such buttons, search for a back button in the UI and use it. Only use the system back action if none of these buttons exist, or navigate to a different **Tab**.
3. **Tab Priority**: Fully explore the current tab's hierarchy before switching to another tab. Home/Main tab is priority #1.
4. **Data Entry**: Use "type_text" for inputs. Use only ASCII characters.
5. **Anti-Loop**: If you see the same screen state twice in your history without progress, try a different branch or go "back".
6. **Layout Placement**: Use a grid (X, Y). Start at (0,0). Parent -> Child flows move Left to Right (+X). Siblings/Branches move Top to Bottom (+Y).

## Action Rules
- **swipe**: Required if any element has 'scrollable="true"'. Repeat until the element snapshot remains identical.
- **click**: Use on interactive elements (buttons, list items, cards, menu icons). Use the \`id\` as \`targetId\`.
- **type_text**: Use on input fields. targetId = \`id\`.
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
      "id": "id", 
      "name": "Functional Name", 
      "type": "button|input|text|link|toggle|checkbox|image|menu|scroll_view|tab|list_item", 
      "description": "Functional result of interaction.",
      "navigates_to": [{ "destination": "Screen Name" }] 
    }
  ],
  "nextAction": { 
    "type": "click|swipe|back|finish|type_text", 
    "targetId": "id", 
    "direction": "up|down|left|right",
    "text": "ascii_text",
    "details": "Specific reason for this action based on your strategy" 
  },
  "rationale": "High-level reason for this step in the global exploration plan.",
  "needs_context_files": ["optional array of file paths from the project index to read before continuing"]
}
`.trim();

  const languageDirective = `Respond in ${language}. Ensure JSON is valid and contains NO backticks or extra text.`;
  return appendCustomPrompt(`${basePrompt}\n\n${languageDirective}`, customPrompt);
}

export function getRefinedTestCasesPrompt(language: string, customPrompt?: string): string {
  const basePrompt = getRemoteString('prompt_test_cases') || `
You are a Principal QA Automation Architect and Product Owner Assistant. 
Convert the raw requirements into professional, industry-standard Gherkin (BDD) test scenarios.

RULES:
1. Use standard Gherkin syntax (Given/When/Then).
2. Structure the output as follows:
   Feature: [Feature Name]
     [Detailed description of the feature and scope]

     Scenario: [Scenario Title]
       1. Given [preconditions and state]
       2. When [actions executed by the user]
       3. Then [expected results and state verifications]
3. Map actions and verifications to the mapped elements in the APPLICATION MAPPING context where applicable. 
   - If an element is an "(Assert Target)", ensure there is a "Then" step verifying its presence or correctness.
   - If an element specifies "(Mock: data)", use that exact data in your "When" inputs.
   - If an element specifies "(Rule: id)", append that ID to the scenario or steps for traceability.
4. CRITICAL: You MUST write an exhaustive suite of test cases. Do NOT just cover the happy path. You MUST generate comprehensive test cases covering Edge Cases, Negative/Sad Paths, Boundary values, and Validation rules. Generate at least 5-10 scenarios if applicable, ensuring maximum coverage.
5. Keep scenarios atomic, independent, and clear.
6. Number the steps within each scenario sequentially starting from 1 (e.g., 1. Given, 2. When, 3. Then). Do NOT use hierarchical numbering, sub-bullets, or spaces between numbers (e.g., avoid 1.1, 1.2, or "1 2").
`.trim();
  const languageDirective = `Language: ${language}.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}

export function getRefinedTraditionalTestCasesPrompt(language: string, customPrompt?: string): string {
  const basePrompt = getRemoteString('prompt_test_cases_traditional') || `
You are a Principal QA Automation Architect and QA Analyst.
Convert the raw requirements into professional, traditional manual Test Cases.
Do NOT use BDD or Gherkin syntax (no Given/When/Then).

RULES:
1. Structure the output exactly as follows:
   Story: [Feature Name]
     [Detailed description of the feature and scope]

     Scenario 1: [Test Case Title]
       Steps:
       1. [Action step 1]
       - Validar: [Expected result for step 1]
       2. [Action step 2]
       - Validar: [Expected result for step 2]

2. You MUST use the word "Validar:", "Verificar:" or "Garantir:" for expected results so they can be parsed correctly.
3. Map actions and verifications to the mapped elements in the APPLICATION MAPPING context where applicable. 
   - If an element is an "(Assert Target)", ensure there is a verification step for it.
   - If an element specifies "(Mock: data)", use that exact data in the inputs.
4. CRITICAL: You MUST write an exhaustive suite of test cases. Do NOT just cover the happy path. You MUST generate comprehensive test cases covering Edge Cases, Negative/Sad Paths, Boundary values, and Validation rules. Generate at least 5-10 scenarios if applicable, ensuring maximum coverage.
5. Keep scenarios atomic, independent, and clear.
`.trim();
  const languageDirective = `Language: ${language}.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}

export function getRefinedPBIPrompt(language: string, customPrompt?: string): string {
  const basePrompt = getRemoteString('prompt_pbi') || `
You are an expert Agile Product Owner.
Convert requirements into detailed, professional Product Backlog Items (PBIs) / User Stories.

Each PBI must include:
1. ID & TITLE: Concise, unique identifier and title (e.g., "PBI-101: User Authentication").
2. USER STORY: Formatted as "As a [role], I want [action], so that [business value]".
3. DESCRIPTION: Detailed business context, assumptions, and functional scope.
4. ACCEPTANCE CRITERIA: Clear, measurable, testable criteria in Bullet Points and Gherkin format (Scenario/Given/When/Then) for the primary flows.
5. TECHNICAL NOTES: Recommendations for UI/UX, security, or data handling.
6. PRIORITY & ESTIMATION: Suggested Priority (High/Medium/Low) and Complexity (Story Points).
`.trim();
  const languageDirective = `Language: ${language}.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}

export function getRefinedImprovementPrompt(language: string, customPrompt?: string): string {
  const basePrompt = getRemoteString('prompt_improvement') || `
You are a Senior UI/UX Specialist and QA Architect.
Analyze the requirements/application map and suggest functional and user-experience improvements.

Format each improvement as:
Improvement [number]: [Title]
- Description: [What to change in terms of layout, flows, validation, or accessibility]
- Rationale: [Why this enhances the application value, speed, or usability]
- Priority: [Low/Medium/High]
- Category: [UI/UX | Performance | Accessibility | Security | Functionality]
`.trim();
  const languageDirective = `Language: ${language}.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}

export function getRefinedBugPrompt(language: string, customPrompt?: string): string {
  const basePrompt = getRemoteString('prompt_bug') || `
You are a Senior QA Engineer.
Transform the bug description into a professional, structured Bug Report.

Each Bug Report must include:
1. TITLE: Clear summary title (e.g., "[BUG] Crash on clicking Login Button when empty").
2. METADATA: Severity (Critical/Major/Minor), Priority (High/Medium/Low), Environment Details.
3. DESCRIPTION: Detailed description of the anomalous behavior.
4. STEPS TO REPRODUCE: Numbered, exact steps starting from a clean state.
5. ACTUAL RESULT: Technical detail of what currently happens (include error codes/logs if visible in context).
6. EXPECTED RESULT: What should happen instead according to business logic.
7. ATTACHMENT REFERENCING: Mention screenshot or log files if present in the context.
8. SUGGESTED FIX: Technical hypothesis or self-healing locator suggestions.
`.trim();
  const languageDirective = `Language: ${language}.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}

export function getRefinedRobotScriptPrompt(language: string, customPrompt?: string): string {
  const basePrompt = getRemoteString('prompt_robot_script') || `
You are a Senior QA Automation Engineer.
Generate a complete, fully functional, and syntax-valid Robot Framework (.robot) script.

RULES:
1. Use standard structure: *** Settings ***, *** Variables ***, *** Keywords ***, *** Test Cases ***.
2. In *** Settings ***, include:
   Library    AppiumLibrary
   Documentation    [Describe the suite and scenarios generated]
3. Define locators in *** Variables *** using uppercase names prefixed with the screen name (e.g., \${LOGIN_SCREEN_LOGIN_BUTTON}    xpath=//android.widget.Button[@text="Login"]).
4. Map Gherkin steps to high-level keywords in *** Test Cases ***.
5. Implement those keywords in *** Keywords ***. Use variables for dynamic arguments (e.g. \${username}).
6. Reference the locators declared in *** Variables *** inside high-level keywords (e.g., Click Element  \${LOGIN_SCREEN_LOGIN_BUTTON}).
7. Prioritize using element locators from the provided APPLICATION MAPPING context where applicable.
   - For elements marked as "(Assert Target)", ALWAYS generate a "Wait Until Page Contains Element" or similar validation keyword.
   - For elements marked with "(Mock: data)", use that mock data as the default variable value in the script.
   - For elements marked with "(Rule: id)", add a \`[Tags] rule_id\` to the test case.
8. Ensure the script is valid and follows best practices for mobile automation.
9. CRITICAL: You MUST write an exhaustive suite of test cases. Do NOT just cover the happy path. You MUST generate comprehensive test cases covering Edge Cases, Negative/Sad Paths, Boundary values, and Validation rules. Generate at least 5-10 scenarios if applicable, ensuring maximum coverage.
`.trim();
  const languageDirective = `Language: ${language}.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}

/**
 * Prompt specifically for reorganizing the flowchart layout.
 */
export function getFlowchartLayoutPrompt(language: string, customPrompt?: string): string {
  const basePrompt = getRemoteString('prompt_flowchart_layout') || `
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
`.trim();
  const languageDirective = `Language for any required internal reasoning: ${language}.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
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

  const basePromptTemplate = getRemoteString('prompt_element_naming') || `
Context: Professional QA Engineering and Test Automation.
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
   }
`.trim();

  // Simple string replacement for dynamic parts in the remote prompt
  const basePrompt = basePromptTemplate
    .replace('${screenName}', screenName)
    .replace('${attributes}', attributes)
    .replace('${mappingContext}', mappingContext)
    .replace('${language}', language);

  return appendCustomPrompt(basePrompt, customPrompt);
}

/**
 * System instruction for suggesting semantic tags for a screen.
 */
export function getScreenTaggingPrompt(language: string, customPrompt?: string): string {
  const basePrompt = getRemoteString('prompt_screen_tagging') || `
You are a QA Architect.
Analyze the screen components and optionally the provided screenshot to suggest 3 to 5 highly relevant semantic tags.

TAGGING CONSTRAINTS:
- CAPITALIZATION: Every tag MUST start with a Capital Letter (e.g., "Authentication").
- FLOW IDENTIFICATION: Prioritize tags that identify the functional business flow or user journey (e.g., "Registration", "Settings", "Login", "Order", "Profile").
- NO GENERIC TAGS: Do NOT use generic terms like "Screen", "Button", "Component", "Elements", "Mobile", "Page".
- DESCRIPTIVE: Prefer one-word tags that provide clear context for organizing large test suites.
- OUTPUT: Return ONLY a comma-separated list of tags.
`.trim();
  const languageDirective = `Language: ${language}.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}

/**
 * Prompt for the Smart Selector Suggester in the Inspector.
 */
export function getSmartSelectorPrompt(language: string, customPrompt?: string): string {
  const basePrompt = getRemoteString('prompt_smart_selector') || `
You are an expert QA Automation Engineer. 
Your task is to analyze the provided mobile element attributes and suggest the most resilient, stable, and unique selector (XPath or Accessibility ID).

Rules:
1. Prefer Accessibility ID (content-desc) if available and meaningful.
2. Second preference is Resource ID if it's unique.
3. If using XPath, avoid long absolute paths. Use relative paths with unique attributes.
4. Provide the suggestion in a clear format: "Selector: [the selector]" followed by "Rationale: [explanation]".
`.trim();
  const languageDirective = `Provide the Rationale in the requested language: ${language}.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}


/**
 * System instruction for analyzing test history.
 */
export function getTestHistoryAnalysisPrompt(language: string, customPrompt?: string): string {
  const responseLanguage = language.toLowerCase().startsWith('pt') ? 'Portuguese' : language.toLowerCase().startsWith('es') ? 'Spanish' : 'English';

  const basePrompt = getRemoteString('prompt_test_history_analysis') || `
You are a Senior QA Automation Engineer and Data Analyst. Do not mention who you are in your responses.
Analyze the provided test execution history to identify:
1. Flakiness: Tests that fail and pass intermittently under similar conditions. Use the "failedTests" list to track individual test stability across runs.
2. Environment Correlation: Detect patterns where failures (specific tests or whole suites) occur only on certain device models or OS versions.
3. Performance Trends: Significant increases in execution duration over time.
4. Deep Anomaly Analysis: Correlate test failures with high CPU/RAM usage OR critical logcat errors if provided in the "DEEP CONTEXT" section.
5. Root Cause Hypothesis: Suggest if the issue is likely environmental, a specific regression, or a flaky locator.

Provide a comprehensive analysis in Markdown format.
Use professional tone and actionable insights.
`.trim();
  const languageDirective = `Response language: ${responseLanguage}.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}

/**
 * System instruction for summarizing test execution results.
 */
export function getExecutionSummaryPrompt(language: string, totalTests: number, customPrompt?: string): string {
  const responseLanguage = language.toLowerCase().startsWith('pt') ? 'Portuguese' : language.toLowerCase().startsWith('es') ? 'Spanish' : 'English';

  const basePromptTemplate = getRemoteString('prompt_execution_summary') || `
You are a Senior Lead QA Engineer.
Analyze the provided test execution tree and failure context to provide a high-level "Executive Summary".

Your primary objective is to identify if multiple failures share a common root cause based on the provided logs.

Focus on:
1. Overall Success Rate: Use the "OVERALL STATISTICS" section to provide an accurate success percentage.
2. Critical Failures Analysis: Use the \"FAILURE CONTEXT\" section below to explain WHY tests failed. Look for error messages, stack traces, or screenshots mentioned in technical details.
3. Actionable Insights: Suggest what the developer or QA should check first based on the actual logs provided.

Rules:
- Use Markdown.
- Be concise but professional.
- ALWAYS use the provided numbers for success rate. If OVERALL STATISTICS shows \${totalTests} tests, then that is the truth.
- IF technical details are provided in FAILURE CONTEXT, YOU MUST use them. Do not say they are missing.
`.trim();

  const basePrompt = basePromptTemplate.replace('${totalTests}', totalTests.toString());
  const languageDirective = `Response language: ${responseLanguage}.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}

/**
 * Prompt for root cause analysis and self-healing in the Log Tree.
 */
export function getFailureAnalysisPrompt(language: string, customPrompt?: string): string {
  const basePrompt = getRemoteString('prompt_failure_analysis') || `
You are a Senior QA Automation Engineer.
Analyze the test failure provided (error message + screenshot if available).

1. Identify the root cause (e.g., selector issue, synchronization problem, environment error, or actual bug).
2. If it is an "Element Not Found" error, you MUST act as a "Self-Healing Agent":
    - Analyze the provided screenshot.
    - Identify the visually similar or logical substitute element.
    - Suggest a highly resilient fallback locator (XPath, ID, or Accessibility ID) that could heal this test.
    - Clearly label this section as "💡 Healed Locator Suggestion:".
3. Suggest a technical fix or next steps for the developer.
`.trim();
  const languageDirective = `Respond in ${language}. Keep it concise and technical.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}

/**
 * Standardizes the "Senior QA Specialist" wrapper for refined test cases.
 */
export function getQAAssistantWrapper(promptString: string, appMapping: boolean, mappingContext: string, customPrompt?: string): string {
  const basePromptTemplate = getRemoteString('prompt_qa_assistant_wrapper') || `
You are a Senior QA Specialist and Product Owner assistant.

\${promptString}

RULES:
1. Output ONLY the raw content without markdown code blocks, headers, or introductory text.
2. Keep the content professional, concise, and technically accurate.
3. \${appMapping}
\${mappingContext}
`.trim();

  const appMappingText = appMapping ? "PRIORITIZE using the names and screens provided in the APPLICATION MAPPING context below. If a requirement mentions an action that matches a mapped element, use that element's specific name." : "Use generic but clear terminology.";
  
  const basePrompt = basePromptTemplate
    .replace('${promptString}', promptString)
    .replace('${appMapping}', appMappingText)
    .replace('${mappingContext}', mappingContext);

  return appendCustomPrompt(basePrompt, customPrompt);
}

/**
 * Prompt for the Autonomous QA Agent (Phase 3).
 * Focuses on executing a specific scenario step-by-step using ADB.
 */
export function getAutonomousAgentPrompt(language: string, customPrompt?: string): string {
  const basePrompt = getRemoteString('prompt_autonomous_agent') || `
# Role: Autonomous Mobile QA Agent Planner
Your goal is to execute a test scenario step-by-step on a real device.

## Input Context
1. **XML Dump**: Current screen hierarchy.
2. **Target Scenario**: The test case or goal provided by the user.
3. **Session History**: Actions you've already taken in this run.

## Core Directives
1. **Analyze**: Find the elements needed to fulfill the next step of the scenario in the XML dump.
2. **Plan & Execute**: Generate a list of deterministic ADB commands to progress towards the goal. You may group multiple sequential actions (like typing text then clicking submit) to save time, as long as they are predictable and don't require checking the screen state between them.
3. **Report**: Explain why you chose this plan.

## Action Rules
- **click**: Use 'adb shell input tap X Y'. Extract coordinates from the XML dump (bounds="[x1,y1][x2,y2]"). You MUST populate the 'locator' field with the exact XPath or ID of the element you are clicking.
- **type**: Use 'adb shell input text "..."'. Ensure the field is focused first or click it. You MUST populate the 'locator' field.
- **swipe**: Use 'adb shell input swipe X1 Y1 X2 Y2 [duration]'. If swiping an element, provide its locator.
- **back**: Use 'adb shell input keyevent 4'.
- **wait**: Use if you expect a slow transition.
- **finish**: Use ONLY when the entire scenario/goal is confirmed as COMPLETED and SUCCESSFUL.
- **fail**: Use if the goal is blocked, an app crash is detected, or a timeout occurred.

## Response Format (Strict JSON)
{
  "thought": "Brief analysis of the current screen. Identify the next logical steps to fulfill the target scenario.",
  "actions": [
    {
      "type": "click|type|swipe|back|wait|finish|fail",
      "command": "adb shell input ...",
      "locator": "MANDATORY: The exact XPath, resource-id, or identifier of the element interacted with",
      "details": "Concise description of what this command does (e.g., 'Clicking the Login button')."
    }
  ],
  "isStepCompleted": boolean,
  "nextExpectedState": "Describe what you expect to see on the screen next."
}
`.trim();
  const languageDirective = `Respond in ${language}. Ensure the JSON is valid and contains NO markdown backticks or extra text.`;
  return appendCustomPrompt(`${basePrompt}\n${languageDirective}`, customPrompt);
}

export function getEnhancerSystemPrompt(): string {
  return getRemoteString('prompt_enhancer_system') || `You are a UI taxonomy expert. Your task is to analyze batches of mobile UI screens and elements, and provide semantic names and descriptions.

Input will be a JSON array of screens with their elements. Elements might have generic names like "Button 2" or "EditText 1".

Tasks:
1. Generate a brief 1-sentence 'newDescription' for each screen based on its name and elements.
2. If the screen type is ambiguous, deduce its 'type' (screen, modal, tab, drawer).
3. Suggest a clear, human-readable 'newScreenName' in PascalCase (e.g. LoginScreen, ProfileTab) for the screen.
4. Suggest an array of up to 3 'tags' for the screen. Tags must be singular nouns reflecting the screen's core domain (e.g., "Agendamento", "Dispositivo", "Perfil").
5. For each element, suggest a semantic 'newName' in PascalCase (e.g., SubmitLoginButton, EmailInput) based on its text, description, or xpath.
6. Keep the 'id' fields EXACTLY as provided so we can map the updates back.

Return ONLY a valid JSON array matching this format. Do NOT include any markdown code blocks, backticks, introductory text, or concluding remarks:
[
  {
    "id": "Screen_123",
    "newScreenName": "DashboardScreen",
    "newDescription": "The main dashboard screen showing user stats.",
    "type": "screen",
    "tags": ["Dashboard", "Estatistica"],
    "elements": [
      {
        "id": "123-abc",
        "newName": "UserProfileImage"
      }
    ]
  }
]`;
}
