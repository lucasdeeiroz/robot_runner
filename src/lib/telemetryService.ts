import { invoke } from '@tauri-apps/api/core';
import { AppSettings } from './settings';

export interface TelemetryEventOptions {
    evento: string;
    status?: 'PASS' | 'FAIL' | 'MANUAL' | 'BLOQUEADO' | 'SUCCESS' | 'ERROR';
    duracaoMs?: number;
    totalTestes?: number;
    testesPass?: number;
    testesFail?: number;
    testesManual?: number;
    metadados?: Record<string, any>;
}

export async function emitTelemetryEvent(settings: AppSettings, options: TelemetryEventOptions): Promise<boolean> {
    if (!settings.telemetryWebhooks?.enabled || !settings.telemetryWebhooks.endpointUrl) {
        return false;
    }

    try {
        const payload = {
            evento: options.evento,
            timestamp: new Date().toISOString(),
            duracao_ms: options.duracaoMs,
            status: options.status,
            total_testes: options.totalTestes,
            testes_pass: options.testesPass,
            testes_fail: options.testesFail,
            testes_manual: options.testesManual,
            tags: settings.telemetryWebhooks.tags || {},
            metadados: options.metadados || {}
        };

        const result = await invoke<boolean>('dispatch_telemetry_event', {
            endpointUrl: settings.telemetryWebhooks.endpointUrl,
            headers: settings.telemetryWebhooks.headers || {},
            payload
        });

        return result;
    } catch (e) {
        console.warn('[TelemetryService] Failed to dispatch telemetry event:', e);
        return false;
    }
}
