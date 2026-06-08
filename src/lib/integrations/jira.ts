import { fetch } from '@tauri-apps/plugin-http';

export interface JiraConfig {
    host: string;
    email: string;
    apiToken: string;
    projectKey: string;
}

function getFormattedHost(host: string): string {
    let formatted = host.trim();
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
        formatted = `https://${formatted}`;
    }
    // Strip trailing slash if present
    return formatted.replace(/\/+$/, '');
}

export async function createJiraIssue(
    summary: string,
    description: string,
    type: 'Story' | 'Bug',
    config: JiraConfig
): Promise<{ key: string; url: string }> {
    const { host, email, apiToken, projectKey } = config;
    if (!host || !email || !apiToken || !projectKey) {
        throw new Error("Jira configuration is incomplete.");
    }

    const baseUrl = getFormattedHost(host);
    const url = `${baseUrl}/rest/api/3/issue`;
    const basicAuth = btoa(`${email}:${apiToken}`);

    // Convert description text to Atlassian Document Format (ADF)
    const paragraphs = description.split('\n').map(line => ({
        type: "paragraph",
        content: [
            {
                type: "text",
                text: line || " "
            }
        ]
    }));

    const body = {
        fields: {
            project: {
                key: projectKey
            },
            summary: summary,
            description: {
                type: "doc",
                version: 1,
                content: paragraphs
            },
            issuetype: {
                name: type === 'Bug' ? 'Bug' : 'Story'
            }
        }
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${basicAuth}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to create Jira issue: ${response.statusText} (${errText})`);
        }

        const data = await response.json();
        return {
            key: data.key,
            url: `${baseUrl}/browse/${data.key}`
        };
    } catch (e: any) {
        console.error("Jira error:", e);
        throw e;
    }
}

export async function testJiraConnection(config: JiraConfig): Promise<boolean> {
    const { host, email, apiToken, projectKey } = config;
    if (!host || !email || !apiToken || !projectKey) {
        throw new Error("Jira configuration is incomplete.");
    }

    const baseUrl = getFormattedHost(host);
    const url = `${baseUrl}/rest/api/3/project/${encodeURIComponent(projectKey)}`;
    const basicAuth = btoa(`${email}:${apiToken}`);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'Accept': 'application/json'
            }
        });

        return response.ok;
    } catch (e) {
        console.error("Jira connection test failed:", e);
        return false;
    }
}
