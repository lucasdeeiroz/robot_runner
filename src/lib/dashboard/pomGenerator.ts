import { ScreenMap, UIElementMap } from '../types';

export function generateRobotResource(screenMap: ScreenMap): string {
  const lines: string[] = [];
  
  lines.push('*** Settings ***');
  lines.push(`Documentation    Page Object Model for ${screenMap.name} screen.`);
  lines.push('');
  
  lines.push('*** Variables ***');
  
  // Format variables: ${<SCREEN_NAME> <ELEMENT_NAME>}    <LOCATOR>
  const screenPrefix = screenMap.name.replace(/\s+/g, '_').toUpperCase();
  
  screenMap.elements.forEach(el => {
    const varName = el.name.replace(/\s+/g, '_').toUpperCase();
    const locator = getBestLocator(el);
    lines.push(`\${${screenPrefix}_${varName}}    ${locator}`);
  });
  
  lines.push('');
  lines.push('*** Keywords ***');
  
  // Screen-level Assertion Keyword
  const assertionElements = screenMap.elements.filter(e => e.assertion_target);
  if (assertionElements.length > 0) {
    lines.push(`Verify ${screenMap.name} Loaded`);
    lines.push(`    [Documentation]    Verify that the ${screenMap.name} screen is fully loaded by checking assertion targets.`);
    assertionElements.forEach(el => {
        const varName = el.name.replace(/\s+/g, '_').toUpperCase();
        lines.push(`    Wait Until Element Is Visible    \${${screenPrefix}_${varName}}    timeout=15s`);
    });
    lines.push('');
  }
  
  // Add common interaction keywords for each element
  screenMap.elements.forEach(el => {
    const varName = el.name.replace(/\s+/g, '_').toUpperCase();
    const fullName = `\${${screenPrefix}_${varName}}`;
    
    // Click Template
    lines.push(`Click ${el.name}`);
    lines.push(`    [Documentation]    Click on the ${el.name} element.`);
    lines.push(`    Click Element    ${fullName}`);
    lines.push('');

    // Wait Template
    lines.push(`Wait Until ${el.name} Is Visible`);
    lines.push(`    [Documentation]    Wait until ${el.name} is visible on screen.`);
    lines.push(`    Wait Until Element Is Visible    ${fullName}`);
    lines.push('');

    // Input Template (only for input types)
    if (el.type === 'input') {
      lines.push(`Input Text Into ${el.name}`);
      lines.push(`    [Arguments]    \${text}`);
      lines.push(`    [Documentation]    Enter text into the ${el.name} field.`);
      lines.push(`    Input Text    ${fullName}    \${text}`);
      lines.push('');
    }
  });

  return lines.join('\n');
}

function getBestLocator(element: UIElementMap): string {
  if (element.primary_locator) return element.primary_locator;
  if (element.accessibility_id) return `accessibility_id=${element.accessibility_id}`;
  if (element.android_id) return `id=${element.android_id}`;
  if (element.text) return `text=${element.text}`;
  return `xpath=${element.xpath || element.id}`;
}

export function generateProjectRobotResources(maps: ScreenMap[]): Record<string, string> {
  const result: Record<string, string> = {};
  maps.forEach(map => {
    const fileName = `${map.id}.robot`;
    result[fileName] = generateRobotResource(map);
  });
  return result;
}
