import { fetch } from '@tauri-apps/plugin-http';

export interface WebhookPayload {
    suiteName: string;
    status: 'passed' | 'failed';
    passCount: number;
    failCount: number;
    duration: string;
    deviceName: string;
    framework: string;
}

export async function sendWebhookNotification(
    platform: 'slack' | 'teams',
    url: string,
    payload: WebhookPayload
): Promise<boolean> {
    if (!url) return false;

    let body: any = {};

    const statusEmoji = payload.status === 'passed' ? '🟢 PASS' : '🔴 FAIL';
    const color = payload.status === 'passed' ? '28a745' : 'dc3545';

    if (platform === 'slack') {
        body = {
            text: `Robot Runner AI: Test Execution Finished - ${statusEmoji}`,
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: `Test Run: ${payload.suiteName} (${statusEmoji})`
                    }
                },
                {
                    type: "section",
                    fields: [
                        {
                            type: "mrkdwn",
                            text: `*Framework:* ${payload.framework}`
                        },
                        {
                            type: "mrkdwn",
                            text: `*Device:* ${payload.deviceName}`
                        },
                        {
                            type: "mrkdwn",
                            text: `*Passed:* ${payload.passCount}`
                        },
                        {
                            type: "mrkdwn",
                            text: `*Failed:* ${payload.failCount}`
                        },
                        {
                            type: "mrkdwn",
                            text: `*Duration:* ${payload.duration}`
                        }
                    ]
                }
            ]
        };
    } else {
        // MS Teams Office 365 MessageCard
        body = {
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            "themeColor": color,
            "summary": `Robot Runner AI: Test Run Finished`,
            "sections": [
                {
                    "activityTitle": `Test Run: ${payload.suiteName} (${statusEmoji})`,
                    "facts": [
                        { "name": "Framework", "value": payload.framework },
                        { "name": "Device", "value": payload.deviceName },
                        { "name": "Passed", "value": String(payload.passCount) },
                        { "name": "Failed", "value": String(payload.failCount) },
                        { "name": "Duration", "value": payload.duration }
                    ],
                    "markdown": true
                }
            ]
        };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        return response.ok;
    } catch (e) {
        console.error(`Failed to send webhook notification to ${platform}:`, e);
        return false;
    }
}
