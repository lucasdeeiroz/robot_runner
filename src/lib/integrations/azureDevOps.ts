import { fetch } from '@tauri-apps/plugin-http';

export interface AzureDevOpsConfig {
    org: string;
    project: string;
    pat: string;
}

export async function createAzureWorkItem(
    title: string,
    description: string,
    type: 'PBI' | 'Bug',
    config: AzureDevOpsConfig
): Promise<{ id: number; url: string }> {
    const { org, project, pat } = config;
    if (!org || !project || !pat) {
        throw new Error("Azure DevOps configuration is incomplete.");
    }

    const workItemType = type === 'Bug' ? 'Bug' : 'Product Backlog Item';
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis/wit/workitems/$${encodeURIComponent(workItemType)}?api-version=6.0`;
    const basicAuth = btoa(`:${pat}`);

    const body = [
        {
            op: "add",
            path: "/fields/System.Title",
            value: title
        },
        {
            op: "add",
            path: "/fields/System.Description",
            value: description
        }
    ];

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json-patch+json',
                'Authorization': `Basic ${basicAuth}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Failed to create work item: ${response.statusText} (${errText})`);
        }

        const data = await response.json();
        return {
            id: data.id,
            url: data._links?.html?.href || `https://dev.azure.com/${org}/${project}/_workitems/edit/${data.id}`
        };
    } catch (e: any) {
        console.error("Azure DevOps error:", e);
        throw e;
    }
}

export async function testAzureConnection(config: AzureDevOpsConfig): Promise<boolean> {
    const { org, project, pat } = config;
    if (!org || !project || !pat) {
        throw new Error("Azure DevOps configuration is incomplete.");
    }

    const url = `https://dev.azure.com/${encodeURIComponent(org)}/_apis/projects/${encodeURIComponent(project)}?api-version=6.0`;
    const basicAuth = btoa(`:${pat}`);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${basicAuth}`
            }
        });

        return response.ok;
    } catch (e) {
        console.error("Azure DevOps test connection failed:", e);
        return false;
    }
}
