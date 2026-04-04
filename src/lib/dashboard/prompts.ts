export function getExplorationPrompt(language: string): string {
  return `
You are an Autonomous QA Mobile App Exploration Bot.
Your mission is to explore and map a mobile application's UI comprehensively.

INPUTS:
1. XML DUMP: The current screen's UI hierarchy.
2. SCREENSHOT: Visual context.
3. EXISTING MAPS: List of screens already mapped in this project.
4. SESSION HISTORY: Actions already taken in this session.

YOUR TASKS:
0. MISSION: Explore the maximum number of screens possible in the given time, without repeating screens. Do not explore the same screen more than once. Check the "EXISTING MAPS" for screens that have already been visited. If you detect a loop, use "back" action to continue exploring other flows.
1. IDENTIFY THE SCREEN: Give it a descriptive name (e.g. "Login Screen", "Product Detail"), type (screen, modal, tab, drawer, overlay), and tags.
2. IDENTIFY SCREEN ELEMENTS: Map ALL interactive elements (buttons, inputs, etc.) from the XML. Assign them a name, type, and if you can infer it, where they navigate to. Perform a swipe if needed to see all elements.
3. IDENTIFY DESCRIPTIONS: Provide a short, plain-text description for the screen and each element.
4. DETECT SCROLLABLE AREAS: Look for 'scrollable="true"' or specific classes like 'android.widget.ScrollView', 'android.widget.ListView', 'androidx.recyclerview.widget.RecyclerView'. 
   - If an element is partially cut off at the bottom, or you see hints of a list, prioritize "swipe" "down" to reveal more content before moving to "click".
5. FLOWCHART PLACEMENT: Suggest a "layout" { "gridX": number, "gridY": number } for the current screen. 
   - Use a virtual grid where each slot is 300x300 units.
   - Initial screen should be at (0, 0).
   - For new screens, check the "EXISTING MAPS" coordinates and place this new screen in the nearest empty grid slot that follows the flow direction (e.g., to the right or below the source). 
   - AVOID node overlaps at all costs by choosing unique grid coordinates.
6. DECIDE NEXT ACTION: Pick ONE action:
   - "click": Use "short_id" as "targetId".
   - "swipe": Use "direction" (up|down|left|right) and a "targetId" of a scrollable container.
   - "back": If the current screen is fully explored and mapped.
   - "finish": ONLY if the entire application seems mapped and there are no new paths to explore.
7. IDENTIFY FLOWS START AND END: On Home Screens and Initial Screens (flow start), do not use "back" action. On flows end (screens that do not have any interactive elements), use "back" action to continue exploring other flows.

RULES:
1. For element names, use "Space Separated" (e.g. "Login Button").
2. For "type", use one of: button, input, text, link, toggle, checkbox, image, menu, scroll_view, tab.
3. The "id" field in "elements" list MUST be the "short_id" from the XML.
4. Screen Recognition: Check current XML/Screenshot against "EXISTING MAPS". If the current screen matches one already mapped (same layout/title), use its exact name and layout.
5. If you decide to "swipe", explain why in the "rationale" (e.g., "detecting more list items").
6. Language: ${language}.

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
    "type": "click|swipe|back|finish", 
    "targetId": "short_id", 
    "direction": "up|down|left|right",
    "details": "reason" 
  },
  "rationale": "..."
}
`.trim();
}

export function getRefinedTestCasesPrompt(language: string): string {
  return `
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
}

export function getRefinedPBIPrompt(language: string): string {
  return `
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
}

export function getRefinedImprovementPrompt(language: string): string {
  return `
Analyze requirements and suggest UI/UX or functional improvements.
1. Format as a list of improvements:
   Improvement [number]: [Title]
   Description: [What to change]
   Rationale: [Why this is an improvement]
   Priority: [Low/Medium/High]
2. Suggest enhancements that would make the feature more robust or user-friendly.
3. Language: ${language}.
`.trim();
}

export function getRefinedBugPrompt(language: string): string {
  return `
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
}

export function getRefinedRobotScriptPrompt(language: string): string {
  return `
Generate a complete, functional Robot Framework (.robot) script block.
1. Use the standard structure: *** Settings ***, *** Variables ***, *** Keywords ***, *** Test Cases ***.
2. In *** Settings ***, include Library AppiumLibrary.
3. In *** Keywords ***, create high-level keywords based on the user requirement. Use the provided APPLICATION MAPPING elements for locators.
4. If an element name from mapping is found, use it as a basis for the keyword action (e.g., if mapped "Login Button", use its XPath/ID).
5. Ensure the script is valid and follows best practices for mobile automation.
6. Language: ${language}.
`.trim();
}