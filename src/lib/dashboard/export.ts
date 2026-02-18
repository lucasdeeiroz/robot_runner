
import * as XLSX from 'xlsx';
import { Document, Packer, Paragraph, HeadingLevel, AlignmentType, TextRun } from 'docx';
import { saveAs } from 'file-saver';

// Helper to validate requirements (simple check)
export function validateRequirement(text: string): boolean {
    if (!text || !text.trim()) {
        return false;
    }
    return true;
}

const EXPORT_STRINGS: Record<string, any> = {
    es: {
        step: "Prueba",
        actionPath: "Pasos",
        description: "Descripción del Escenario",
        expectedResult: "Resultado Esperado",
        result: "Resultado",
        responsible: "Responsable",
        testScript: "Guión de Prueba",
        story: "Historia:",
        numSteps: "Cant. Pruebas:",
        scenario: "Escenario de Prueba:",
        status: "Estado:",
        completed: "Completado",
        prerequisite: "Prerrequisito:",
        executionDate: "Fecha Ejecución:",
        evidence: "Evidencias",
        autoResult: "Resultado esperado automático",
        docTitle: "Guión de Prueba - Robot Runner",
        sheetName: "Planificación de Pruebas",
        fileNameXlsx: "planificacion_pruebas_robot_runner.xlsx",
        fileNameDocx: "guion_prueba_robot_runner.docx"
    },
    pt: {
        step: "Teste",
        actionPath: "Passos",
        description: "Descrição do Cenário",
        expectedResult: "Resultado Esperado",
        result: "Resultado",
        responsible: "Responsável",
        testScript: "Roteiro de Teste",
        story: "História:",
        numSteps: "Qtd. Testes:",
        scenario: "Cenário de Teste:",
        status: "Status:",
        completed: "Concluído",
        prerequisite: "Pré-requisito",
        executionDate: "Data Execução:",
        evidence: "Evidências",
        autoResult: "Resultado esperado automático",
        docTitle: "Roteiro de Teste - Robot Runner",
        sheetName: "Planejamento de Testes",
        fileNameXlsx: "planejamento_testes_robot_runner.xlsx",
        fileNameDocx: "roteiro_teste_robot_runner.docx"
    },
    en: {
        step: "Test",
        actionPath: "Steps",
        description: "Scenario Description",
        expectedResult: "Expected Result",
        result: "Result",
        responsible: "Responsible",
        testScript: "Test Script",
        story: "Story:",
        numSteps: "Number of Tests:",
        scenario: "Test Scenario:",
        status: "Status:",
        completed: "Completed",
        prerequisite: "Prerequisite:",
        executionDate: "Execution Date:",
        evidence: "Evidence",
        autoResult: "Expected result automatically",
        docTitle: "Test Script - Robot Runner",
        sheetName: "Test Planning",
        fileNameXlsx: "test_planning_robot_runner.xlsx",
        fileNameDocx: "test_script_robot_runner.docx"
    }
};

function getStrings(language: string) {
    const lang = (language === 'pt_BR' || language === 'pt') ? 'pt' : (language === 'es_ES' || language === 'es') ? 'es' : 'en';
    return EXPORT_STRINGS[lang] || EXPORT_STRINGS['en'];
}

// ---------------------------------------------------------------------------
// EXPORT TO XLSX
// ---------------------------------------------------------------------------
export function exportToXlsx(content: string, language: string = 'en') {
    if (!content.trim()) return;

    const strings = getStrings(language);

    // 1. Split Scenarios
    const scenarioBlocks = content
        .split(/(?=Scenario|Cenário|Escenario)/g)
        .map(b => b.trim())
        .filter(b => b.length > 0);

    // Extract Story Info
    let storyId = "000000";
    let storyName = "N/A";

    // Check first block or beginning of content for Story info
    const storyMatch = content.match(/Story:\s*(\d+)\s*-\s*(.+)/i) || content.match(/História:\s*(\d+)\s*-\s*(.+)/i) || content.match(/Historia:\s*(\d+)\s*-\s*(.+)/i);
    if (storyMatch) {
        storyId = storyMatch[1].trim();
        storyName = storyMatch[2].split('\n')[0].trim();
    }

    // Filter out the Story block 
    const tests = scenarioBlocks.filter(block => !block.match(/^(Story|História|Historia):/i));

    const rows: any[] = [];
    let testNumber = 1;

    tests.forEach(testContent => {
        const uniqueDescription = testContent.replace(/\n/g, "\n");

        let stepsText = "https://sua-url.com";
        let scenarioDescription = uniqueDescription;

        // Regex to find Passos/Steps section
        const stepsMatch = uniqueDescription.match(/(Passos:|Steps:|Pasos:)/i);

        if (stepsMatch && stepsMatch.index !== undefined) {
            scenarioDescription = uniqueDescription.substring(0, stepsMatch.index).trim();
            stepsText = uniqueDescription.substring(stepsMatch.index + stepsMatch[0].length).trim();
        }

        // Extract Expected Result
        let expectedResult = strings.autoResult;
        const lines = scenarioDescription.split('\n');
        const thenLine = lines.find(l => l.trim().match(/^(Then|Então|Entonces|Enntão)\s/i));

        if (thenLine) {
            expectedResult = thenLine.replace(/^(Then|Então|Entonces|Enntão)\s+/i, '').trim();
        }

        rows.push([
            testNumber.toString(),          // Test
            scenarioDescription,            // Scenario Description
            stepsText,                      // Steps
            expectedResult,                 // Expected Result
            "OK",                           // Result
            "Analyst QA"                    // Responsible
        ]);

        testNumber++;
    });

    const headerRow = [strings.step, strings.description, strings.actionPath, strings.expectedResult, strings.result, strings.responsible];

    const infoRows = [
        ["", strings.testScript, "", "", "", ""],
        [strings.story, storyId, strings.numSteps, tests.length, "", ""],
        [strings.scenario, storyName, strings.status, strings.completed, "", ""],
        [strings.prerequisite, "N/A", "", "", "", ""],
        [strings.executionDate, new Date().toLocaleDateString(), "", "", "", ""],
        [""]
    ];

    const data = [
        ...infoRows,
        headerRow,
        ...rows,
        [""],
        ["", strings.evidence, "", "", "", ""]
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Merges
    const evidenceLine = 7 + tests.length + 1;
    ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // Title
        { s: { r: evidenceLine, c: 0 }, e: { r: evidenceLine, c: 5 } } // Evidence Title
    ];

    // Column Widths
    ws["!cols"] = [
        { wch: 12 },
        { wch: 100 },
        { wch: 50 },
        { wch: 35 },
        { wch: 10 },
        { wch: 25 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, strings.sheetName);
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, strings.fileNameXlsx);

    return blob;
}


// ---------------------------------------------------------------------------
// EXPORT TO DOCX
// ---------------------------------------------------------------------------
export async function exportToDocx(content: string, language: string = 'en') {
    const strings = getStrings(language);
    const children: Paragraph[] = [];

    // 1. Parsing - Reuse logic from XLSX
    const scenarioBlocks = content
        .split(/(?=Scenario|Cenário|Escenario)/g)
        .map(b => b.trim())
        .filter(b => b.length > 0);

    let storyId = "000000";
    let storyName = "N/A";

    const storyMatch = content.match(/Story:\s*(\d+)\s*-\s*(.+)/i) || content.match(/História:\s*(\d+)\s*-\s*(.+)/i) || content.match(/Historia:\s*(\d+)\s*-\s*(.+)/i);
    if (storyMatch) {
        storyId = storyMatch[1].trim();
        storyName = storyMatch[2].split('\n')[0].trim();
    }

    const tests = scenarioBlocks.filter(block => !block.match(/^(Story|História|Historia):/i));

    // 2. Header Table
    // 2. Header Info (Paragraphs instead of Table)
    children.push(
        new Paragraph({
            text: strings.docTitle,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
        })
    );

    children.push(
        new Paragraph({
            children: [
                new TextRun({ text: strings.story + " ", bold: true }),
                new TextRun({ text: storyId })
            ],
            spacing: { after: 100 }
        })
    );

    children.push(
        new Paragraph({
            children: [
                new TextRun({ text: strings.numSteps + " ", bold: true }),
                new TextRun({ text: tests.length.toString() })
            ],
            spacing: { after: 100 }
        })
    );

    children.push(
        new Paragraph({
            children: [
                new TextRun({ text: strings.scenario + " ", bold: true }),
                new TextRun({ text: storyName })
            ],
            spacing: { after: 100 }
        })
    );

    children.push(
        new Paragraph({
            children: [
                new TextRun({ text: strings.status + " ", bold: true }),
                new TextRun({ text: strings.completed })
            ],
            spacing: { after: 400 } // Extra space before scenarios
        })
    );

    // children.push(headerTable); // Removed table

    children.push(new Paragraph("")); // Spacer

    // 3. Process Scenarios
    tests.forEach((testContent, index) => {
        let uniqueDescription = testContent.replace(/\n/g, "\n");
        let stepsText = "";
        let scenarioDescription = uniqueDescription;

        // Split Description and Steps matches
        const stepsMatch = uniqueDescription.match(/(Passos:|Steps:|Pasos:)/i);
        if (stepsMatch && stepsMatch.index !== undefined) {
            scenarioDescription = uniqueDescription.substring(0, stepsMatch.index).trim();
            stepsText = uniqueDescription.substring(stepsMatch.index + stepsMatch[0].length).trim();
        }

        // --- Heading 2: Scenario Name ---
        // Extract first line as title if possible
        const descLines = scenarioDescription.split('\n');
        const title = descLines[0] || `Scenario ${index + 1}`;
        const restOfDesc = descLines.slice(1).join('\n');

        children.push(
            new Paragraph({
                text: title,
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 400, after: 200 }
            })
        );

        // --- Paragraph: Description (Tags + Gherkin) ---
        // We will highlight Keywords
        const gherkinKeywords = ["Given", "When", "Then", "And", "But", "Dado", "Quando", "Então", "E", "Mas", "Tags:", "Cenário:", "Scenario:"];

        const descParagraphs = restOfDesc.split('\n').map(line => {
            const trimmed = line.trim();
            if (!trimmed) return null;

            // Check if line starts with a keyword
            const keyword = gherkinKeywords.find(k => trimmed.startsWith(k));

            if (keyword) {
                return new Paragraph({
                    children: [
                        new TextRun({
                            text: keyword,
                            bold: true
                        }),
                        new TextRun({
                            text: trimmed.substring(keyword.length)
                        })
                    ]
                });
            } else {
                return new Paragraph({ text: trimmed });
            }
        }).filter(p => p !== null) as Paragraph[];

        children.push(...descParagraphs);


        // --- Heading 3: Steps ---
        if (stepsText) {
            children.push(
                new Paragraph({
                    text: strings.actionPath, // "Passos"
                    heading: HeadingLevel.HEADING_3,
                    spacing: { before: 200, after: 100 }
                })
            );

            // --- List: Steps ---
            // Split steps by newline or "-"
            const stepLines = stepsText.split('\n').filter(s => s.trim().length > 0);
            stepLines.forEach(step => {
                const cleanStep = step.replace(/^-\s*/, '').trim();
                children.push(
                    new Paragraph({
                        text: cleanStep,
                        bullet: {
                            level: 0
                        }
                    })
                );
            });
        }

        // --- Expected Result ---
        let expectedResult = "";
        const thenLine = descLines.find(l => l.trim().match(/^(Then|Então|Entonces|Enntão)\s/i));
        if (thenLine) {
            expectedResult = thenLine.replace(/^(Then|Então|Entonces|Enntão)\s+/i, '').trim();
        }

        if (expectedResult) {
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({
                            text: strings.expectedResult + ": ",
                            bold: true,
                            color: "2E7D32" // Green color for result label
                        }),
                        new TextRun({
                            text: expectedResult
                        })
                    ],
                    spacing: { before: 200, after: 200 }
                })
            );
        }

        children.push(new Paragraph("")); // Divider
    });

    // 4. Append End of Content (Images if passed, though we are mostly parsing text now)
    // If we want to support images from the DOM, we'd need to mix the approaches.
    // We can add a placeholder for Evidence.

    children.push(
        new Paragraph({
            text: strings.evidence,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { before: 600, after: 200 }
        })
    );

    // Create Document
    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: { top: 720, right: 720, bottom: 720, left: 720 }
                }
            },
            children: children
        }]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, strings.fileNameDocx);
    return blob;
}
