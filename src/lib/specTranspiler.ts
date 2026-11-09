/**
 * Spec-Driven Transpiler for Robot Runner
 * Converts Markdown Test Specifications (cenarios-de-teste.md / Gherkin markdown)
 * into standardized Robot Framework (.robot) test suites and formats test execution results.
 */

export interface ParsedTestScenario {
    id: string;
    title: string;
    description?: string;
    type: 'AUTO' | 'MANUAL';
    steps: Array<{
        keyword: 'Dado' | 'Quando' | 'Então' | 'E' | 'Given' | 'When' | 'Then' | 'And';
        action: string;
    }>;
    expectedResult?: string;
    riskArea?: string;
}

export interface SpecTranspileResult {
    suiteName: string;
    scenarios: ParsedTestScenario[];
    robotSuiteContent: string;
    autoScenarioCount: number;
    manualScenarioCount: number;
}

export interface SpecScenarioExecutionResult {
    id: string;
    title: string;
    type: 'AUTO' | 'MANUAL';
    status: 'PASS' | 'FAIL' | 'MANUAL' | 'BLOQUEADO';
    evidence?: string;
    durationMs?: number;
    errorMessage?: string;
}

/**
 * Parses markdown spec content into structured scenarios.
 */
export function parseMarkdownSpec(markdown: string): ParsedTestScenario[] {
    const scenarios: ParsedTestScenario[] = [];
    const lines = markdown.split('\n');

    let currentScenario: ParsedTestScenario | null = null;
    let scenarioCounter = 1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Match Scenario Headings: e.g., "### 1. Cenário: Login", "## Cenário 1:...", "### Teste 1: ..."
        const headingMatch = line.match(/^#{2,4}\s*(?:(\d+)[\.\)]\s*)?(?:Cenário|Scenario|Teste|Test)?\s*[:\-]?\s*(.+)$/i);
        if (headingMatch && !line.toLowerCase().includes('resumo') && !line.toLowerCase().includes('critérios') && !line.toLowerCase().includes('tabela')) {
            if (currentScenario && currentScenario.steps.length > 0) {
                scenarios.push(currentScenario);
            }

            const id = headingMatch[1] || `SCENARIO_${scenarioCounter++}`;
            const title = headingMatch[2].trim();
            const isManual = title.toLowerCase().includes('[manual]') || title.toLowerCase().includes('(manual)');

            currentScenario = {
                id,
                title: title.replace(/\[manual\]|\(manual\)/gi, '').trim(),
                type: isManual ? 'MANUAL' : 'AUTO',
                steps: []
            };
            continue;
        }

        // Match table rows: | # | Cenário / Descrição | Tipo | Passos / Critérios |
        const tableRowMatch = line.match(/^\|\s*(\d+|[A-Z0-9_-]+)\s*\|\s*([^|]+)\|\s*(AUTO|MANUAL|Auto|Manual)?\s*\|\s*([^|]+)\|/i);
        if (tableRowMatch) {
            const tableId = tableRowMatch[1].trim();
            const tableTitle = tableRowMatch[2].trim();
            const tableType = (tableRowMatch[3]?.toUpperCase() === 'MANUAL' ? 'MANUAL' : 'AUTO') as 'AUTO' | 'MANUAL';
            const rawSteps = tableRowMatch[4].trim();

            const parsedSteps: ParsedTestScenario['steps'] = [];
            const stepMatches = rawSteps.split(/(?:Dado|Quando|Então|E|Given|When|Then|And)\b/i);
            const keywordMatches = rawSteps.match(/\b(Dado|Quando|Então|E|Given|When|Then|And)\b/gi) || [];

            keywordMatches.forEach((kw, idx) => {
                const action = stepMatches[idx + 1]?.trim().replace(/^que\s+/i, '');
                if (action) {
                    parsedSteps.push({
                        keyword: kw as any,
                        action
                    });
                }
            });

            if (parsedSteps.length === 0) {
                parsedSteps.push({
                    keyword: 'Dado',
                    action: `que executo o passo para ${tableTitle}`
                });
            }

            scenarios.push({
                id: tableId,
                title: tableTitle,
                type: tableType,
                steps: parsedSteps
            });
            continue;
        }

        // Match Gherkin bullet steps inside current scenario
        const stepMatch = line.match(/^[-*]?\s*\b(Dado|Quando|Então|E|Given|When|Then|And)\b\s+(.+)$/i);
        if (stepMatch && currentScenario) {
            currentScenario.steps.push({
                keyword: stepMatch[1] as any,
                action: stepMatch[2].trim()
            });
            continue;
        }

        // Check if explicitly marked as MANUAL in line
        if (currentScenario && (line.toLowerCase().includes('tipo: manual') || line.toLowerCase().includes('modo: manual'))) {
            currentScenario.type = 'MANUAL';
        }
    }

    if (currentScenario && currentScenario.steps.length > 0) {
        scenarios.push(currentScenario);
    }

    return scenarios;
}

/**
 * Transpiles parsed scenarios to a complete Robot Framework (.robot) file.
 */
export function transpileToRobotSuite(suiteName: string, scenarios: ParsedTestScenario[]): SpecTranspileResult {
    const cleanSuiteName = suiteName.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    let autoCount = 0;
    let manualCount = 0;

    let robotCode = `*** Settings ***\n`;
    robotCode += `Documentation    Spec-Driven Test Suite generated for ${suiteName}\n`;
    robotCode += `Resource         ../../../resources/base.resource\n`;
    robotCode += `Resource         ../../../resources/common.resource\n\n`;
    robotCode += `Test Setup       Abrir App\n`;
    robotCode += `Test Teardown    Fechar App\n\n`;
    robotCode += `*** Test Cases ***\n`;

    scenarios.forEach((sc) => {
        if (sc.type === 'AUTO') autoCount++;
        else manualCount++;

        robotCode += `${sc.title}\n`;
        robotCode += `    [Documentation]    ID: ${sc.id} | Modo: ${sc.type}\n`;
        if (sc.type === 'MANUAL') {
            robotCode += `    [Tags]    manual\n`;
        }

        sc.steps.forEach((st) => {
            robotCode += `    ${st.keyword} ${st.action}\n`;
        });
        robotCode += `    Capture Page Screenshot\n\n`;
    });

    return {
        suiteName: cleanSuiteName,
        scenarios,
        robotSuiteContent: robotCode,
        autoScenarioCount: autoCount,
        manualScenarioCount: manualCount
    };
}

/**
 * Generates the standardized resultados.md content conforming to Spec-Driven pipelines.
 */
export function generateSpecResultsMarkdown(options: {
    activityCode: string;
    activityTitle: string;
    deviceModel: string;
    deviceSerial: string;
    firmwareImage?: string;
    results: SpecScenarioExecutionResult[];
    totalDurationSeconds: number;
}): string {
    const { activityCode, activityTitle, deviceModel, deviceSerial, firmwareImage, results, totalDurationSeconds } = options;

    const passCount = results.filter(r => r.status === 'PASS').length;
    const failCount = results.filter(r => r.status === 'FAIL').length;
    const manualCount = results.filter(r => r.status === 'MANUAL').length;
    const blockedCount = results.filter(r => r.status === 'BLOQUEADO').length;

    const hasFail = failCount > 0;
    const verdict = hasFail ? 'Corrigir antes' : 'Liberar para merge / homologação';

    let md = `# Relatório de QA da Atividade #${activityCode} — ${activityTitle}\n\n`;
    md += `**Dispositivo:** ${deviceModel} · **Serial:** \`${deviceSerial}\`${firmwareImage ? ` · **Imagem:** \`${firmwareImage}\`` : ''} · **Duração:** ${totalDurationSeconds}s\n\n`;
    md += `## Resumo da Execução\n\n`;
    md += `| Total | PASS | FAIL | MANUAL | BLOQUEADO | Veredito |\n`;
    md += `| :---: | :---: | :---: | :---: | :---: | :---: |\n`;
    md += `| **${results.length}** | 🟢 **${passCount}** | ${failCount > 0 ? `🔴 **${failCount}**` : `0`} | 🟡 **${manualCount}** | ⚪ **${blockedCount}** | **${verdict}** |\n\n`;
    md += `## Detalhamento dos Cenários\n\n`;
    md += `| # | Cenário / Verificação | Modo | Status | Evidência / Detalhes |\n`;
    md += `| :--- | :--- | :---: | :---: | :--- |\n`;

    results.forEach((r, idx) => {
        const statusBadge = r.status === 'PASS' ? '🟢 PASS' :
            r.status === 'FAIL' ? '🔴 FAIL' :
            r.status === 'MANUAL' ? '🟡 MANUAL' : '⚪ BLOQUEADO';

        const evidenceText = r.evidence ? `[\`${r.evidence}\`](evidencias/${r.evidence})` : (r.errorMessage || '-');
        md += `| ${r.id || idx + 1} | ${r.title} | \`${r.type}\` | **${statusBadge}** | ${evidenceText} |\n`;
    });

    md += `\n---\n*Gerado automaticamente pelo Robot Runner via Spec Pipeline Plugin em ${new Date().toLocaleString()}*\n`;
    return md;
}
