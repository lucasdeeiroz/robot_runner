import { ScreenMap, FlowMap, FlowStep, NavigationData } from '../types';

export function generateFlows(maps: ScreenMap[]): FlowMap[] {
    const flows: FlowMap[] = [];

    // Start with screens that have no incoming links (Roots) or just pick the first ones
    // For simplicity, let's trace every possible path up to a max depth (e.g. 10 steps)
    
    // Build an adjacency list for easier traversal
    const adjList = new Map<string, { element: any, nav: NavigationData }[]>();
    
    maps.forEach(map => {
        const edges: { element: any, nav: NavigationData }[] = [];
        map.elements.forEach(el => {
            if (el.navigates_to) {
                if (Array.isArray(el.navigates_to)) {
                    el.navigates_to.forEach(n => edges.push({ element: el, nav: n as NavigationData }));
                } else if (typeof el.navigates_to === 'object') {
                    edges.push({ element: el, nav: el.navigates_to as NavigationData });
                } else if (typeof el.navigates_to === 'string') {
                    edges.push({ element: el, nav: { destination: el.navigates_to } });
                }
            }
        });
        adjList.set(map.name, edges);
    });

    // Simple DFS to find paths
    function dfs(currentScreen: string, currentPath: FlowStep[], depth: number) {
        if (depth > 10) return; // Prevent infinite loops
        
        const edges = adjList.get(currentScreen) || [];
        if (edges.length === 0) {
            // End of path, save flow if it has steps
            if (currentPath.length > 0) {
                const startScreen = currentPath[0].source_screen;
                flows.push({
                    id: `flow_${startScreen}_to_${currentScreen}`.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                    name: `Flow from ${startScreen} to ${currentScreen}`,
                    steps: [...currentPath]
                });
            }
            return;
        }

        // To prevent looping on the same node endlessly in a single path
        if (currentPath.filter(p => p.source_screen === currentScreen).length > 2) return;

        edges.forEach(edge => {
            const destScreen = edge.nav.destination;
            const action = edge.nav.trigger_action || edge.element.suggested_interaction || 'tap';
            const destMap = maps.find(m => m.name === destScreen);
            
            // Expected Result: The target screen is shown, ideally verifying an assertion target
            let expectedResult = `Screen '${destScreen}' is displayed`;
            if (destMap) {
                const assertions = destMap.elements.filter(e => e.assertion_target);
                if (assertions.length > 0) {
                    expectedResult += ` and '${assertions[0].name}' is visible`;
                }
            }

            currentPath.push({
                step_number: currentPath.length + 1,
                source_screen: currentScreen,
                action: `${action} on ${edge.element.name}`,
                element_name: edge.element.name,
                expected_result: expectedResult
            });

            dfs(destScreen, currentPath, depth + 1);
            
            currentPath.pop(); // backtrack
        });
    }

    // Try starting from every screen that seems like a root (or just all screens if small)
    maps.forEach(m => {
        dfs(m.name, [], 0);
    });

    // Deduplicate flows (a flow that is a sub-flow of another might be dropped, but for now we keep distinct full paths)
    const uniqueFlows = Array.from(new Map(flows.map(f => [f.steps.map(s => s.action).join(','), f])).values());
    
    return uniqueFlows;
}

export function generateTestLinkXML(flows: FlowMap[]): string {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testcases>\n`;
    
    flows.forEach(flow => {
        xml += `  <testcase name="${flow.name}">\n`;
        xml += `    <summary><![CDATA[Auto-generated test case from Robot Runner AI]]></summary>\n`;
        xml += `    <steps>\n`;
        flow.steps.forEach(step => {
            xml += `      <step>\n`;
            xml += `        <step_number><![CDATA[${step.step_number}]]></step_number>\n`;
            xml += `        <actions><![CDATA[${step.action}]]></actions>\n`;
            xml += `        <expectedresults><![CDATA[${step.expected_result}]]></expectedresults>\n`;
            xml += `      </step>\n`;
        });
        xml += `    </steps>\n`;
        xml += `  </testcase>\n`;
    });
    
    xml += `</testcases>`;
    return xml;
}

export function generateRobotBDD(flows: FlowMap[]): string {
    const lines: string[] = [];
    lines.push('*** Settings ***');
    lines.push('Documentation    Auto-generated BDD test flows from Robot Runner AI Map.');
    lines.push('Library          AppiumLibrary');
    lines.push('');
    lines.push('*** Test Cases ***');
    
    flows.forEach(flow => {
        const testName = flow.name.replace(/[^a-zA-Z0-9 ]/g, '');
        lines.push(testName);
        flow.steps.forEach(step => {
            const keywordAction = step.action.replace(/[^a-zA-Z0-9 ]/g, '');
            // Simple mapping to Given/When/Then. 
            // In a real BDD we'd need more logic, but we can do simple steps:
            lines.push(`    Wait Until Page Contains Element    # Wait for ${step.source_screen}`);
            lines.push(`    # Action: ${keywordAction}`);
            lines.push(`    Log    Executing: ${keywordAction}`);
            lines.push(`    # Expected Result: ${step.expected_result}`);
            lines.push(`    Log    Verifying: ${step.expected_result}`);
        });
        lines.push('');
    });
    
    return lines.join('\\n');
}
