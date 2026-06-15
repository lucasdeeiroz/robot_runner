import { fetch } from '@tauri-apps/plugin-http';

export interface TestLinkConfig {
    url: string; // Endpoint like http://localhost/testlink/lib/api/xmlrpc/v1/xmlrpc.php
    devKey: string;
    projectId: string;
}

function escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
}

function buildXmlRpcCall(methodName: string, params: Record<string, any>): string {
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<methodCall>\n  <methodName>${methodName}</methodName>\n  <params>\n    <param>\n      <value>\n        <struct>\n`;
    for (const [key, val] of Object.entries(params)) {
        xml += `          <member>\n            <name>${key}</name>\n            <value>`;
        if (typeof val === 'number') {
            xml += `<int>${val}</int>`;
        } else if (typeof val === 'boolean') {
            xml += `<boolean>${val ? 1 : 0}</boolean>`;
        } else if (Array.isArray(val)) {
            xml += `<array><data>`;
            for (const item of val) {
                xml += `<value><struct>`;
                for (const [ik, iv] of Object.entries(item)) {
                    xml += `<member><name>${ik}</name><value>`;
                    if (typeof iv === 'number') {
                        xml += `<int>${iv}</int>`;
                    } else {
                        xml += `<string>${escapeXml(String(iv))}</string>`;
                    }
                    xml += `</value></member>`;
                }
                xml += `</struct></value>`;
            }
            xml += `</data></array>`;
        } else {
            xml += `<string>${escapeXml(String(val))}</string>`;
        }
        xml += `</value>\n          </member>\n`;
    }
    xml += `        </struct>\n      </value>\n    </param>\n  </params>\n</methodCall>`;
    return xml;
}

function extractIdFromResponse(xmlText: string): string | null {
    // Look for <name>id</name><value><int>123</int></value> or similar
    const intMatch = xmlText.match(/<name>id<\/name>\s*<value>\s*<int>(\d+)<\/int>/i);
    if (intMatch) return intMatch[1];
    
    const stringMatch = xmlText.match(/<name>id<\/name>\s*<value>\s*<string>(\d+)<\/string>/i);
    if (stringMatch) return stringMatch[1];
    
    // Fallback: search for any id field
    const generalMatch = xmlText.match(/<struct>[\s\S]*?<name>id<\/name>\s*<value>\s*<(?:int|string)>(\d+)<\/(?:int|string)>/i);
    return generalMatch ? generalMatch[1] : null;
}

export async function createTestLinkSuiteAndCases(
    suiteName: string,
    testCases: Array<{ name: string; summary: string, steps: Array<{ action: string; expectedResult: string }> }>,
    config: TestLinkConfig
): Promise<{ suiteId: string; caseIds: string[] }> {
    const { url, devKey, projectId } = config;
    if (!url || !devKey || !projectId) {
        throw new Error("TestLink configuration is incomplete.");
    }

    // 1. Create Test Suite
    const createSuiteXml = buildXmlRpcCall("tl.createTestSuite", {
        devKey,
        testprojectid: parseInt(projectId, 10),
        testsuitename: suiteName,
        details: "Created automatically by Robot Runner AI"
    });

    const suiteRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: createSuiteXml
    });

    if (!suiteRes.ok) {
        throw new Error(`Failed to create test suite in TestLink: ${suiteRes.statusText}`);
    }

    const suiteResText = await suiteRes.text();
    const suiteId = extractIdFromResponse(suiteResText);

    if (!suiteId) {
        throw new Error(`Failed to parse Suite ID from TestLink response: ${suiteResText}`);
    }

    // 2. Create Test Cases
    const caseIds: string[] = [];
    for (const tc of testCases) {
        const stepsParam = tc.steps.map((step, idx) => ({
            step_number: idx + 1,
            actions: step.action,
            expected_results: step.expectedResult || "Step passes successfully.",
            execution_type: 1 // Manual
        }));

        const createCaseXml = buildXmlRpcCall("tl.createTestCase", {
            devKey,
            testprojectid: parseInt(projectId, 10),
            testsuiteid: parseInt(suiteId, 10),
            testcasename: tc.name,
            summary: tc.summary,
            steps: stepsParam,
            authorLogin: "admin" // Default author
        });

        const caseRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml' },
            body: createCaseXml
        });

        if (caseRes.ok) {
            const caseResText = await caseRes.text();
            const caseId = extractIdFromResponse(caseResText);
            if (caseId) caseIds.push(caseId);
        }
    }

    return { suiteId, caseIds };
}

export async function testTestLinkConnection(config: TestLinkConfig): Promise<boolean> {
    const { url, devKey } = config;
    if (!url || !devKey) {
        throw new Error("TestLink configuration is incomplete.");
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<methodCall>\n  <methodName>tl.ping</methodName>\n</methodCall>`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml' },
            body: xml
        });

        if (!response.ok) return false;
        const text = await response.text();
        return text.includes("Hello!") || text.includes("ping") || text.includes("success");
    } catch (e) {
        console.error("TestLink connection test failed:", e);
        return false;
    }
}
