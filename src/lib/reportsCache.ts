export type ReportType = 'checkup' | 'ai_checkup' | 'companion_bdd' | 'custom';
export type ReportStatus = 'temporary' | 'published';
export type ReportResult = 'approved' | 'rejected' | 'pending';

export interface ReportItem {
    id: string;
    title: string;
    deviceModel: string;
    deviceUdid: string;
    analystName: string;
    timestamp: string;
    type: ReportType;
    status: ReportStatus;
    result?: ReportResult;
    comments?: string;
    filePath?: string;
    htmlContent: string;
    sizeBytes?: number;
}

export interface RustReportFileInfo {
    name: string;
    path: string;
    size_bytes: number;
    modified_timestamp: number;
    title?: string;
    result?: string;
    analyst?: string;
    comments?: string;
}

// In-memory array for session-scoped temporary reports (cleared on app close)
let inMemoryReports: ReportItem[] = [];
const listeners = new Set<() => void>();

function notify() {
    listeners.forEach(fn => fn());
}

export function addTemporaryReport(reportData: Omit<ReportItem, 'id' | 'status'> & { id?: string }): ReportItem {
    const id = reportData.id || `report_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const sizeBytes = reportData.sizeBytes || new Blob([reportData.htmlContent]).size;
    
    const newReport: ReportItem = {
        ...reportData,
        id,
        status: 'temporary',
        sizeBytes
    };

    // Prepend so newest is first
    inMemoryReports = [newReport, ...inMemoryReports.filter(r => r.id !== id)];
    notify();
    return newReport;
}

export function getTemporaryReports(): ReportItem[] {
    return [...inMemoryReports];
}

export function removeTemporaryReport(id: string): void {
    inMemoryReports = inMemoryReports.filter(r => r.id !== id);
    notify();
}

export function markReportPublished(id: string, filePath: string): void {
    inMemoryReports = inMemoryReports.map(r => {
        if (r.id === id) {
            return {
                ...r,
                status: 'published',
                filePath
            };
        }
        return r;
    });
    notify();
}

export function clearTemporaryReports(): void {
    inMemoryReports = [];
    notify();
}

export function subscribeReports(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
