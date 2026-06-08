import { collection, query, orderBy, limit, getDocs, Timestamp, where, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { TestLog } from './historyCache';

/**
 * Fetches the global test history for a specific user from Firestore, 
 * filtered by the current logs path (Project/Profile).
 */
export async function fetchGlobalHistory(uid: string, profileNameOrId: string, maxItems: number = 50): Promise<TestLog[]> {
    if (!db) return [];
    try {
        const historyRef = collection(db, `users/${uid}/history`);
        
        console.log("[Firestore] Fetching history for Profile Name/ID:", profileNameOrId);

        const q = query(
            historyRef, 
            where('logsPath', '==', profileNameOrId),
            orderBy('timestamp', 'desc'), 
            limit(maxItems)
        );
        const querySnapshot = await getDocs(q);
        console.log("[Firestore] Found cloud records:", querySnapshot.size);

        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            
            return {
                id: doc.id,
                run_id: data.runId || null,
                logs_path: data.logsPath || null,
                framework: data.framework || null,
                path: data.testPath || '',
                suite_name: data.suiteName || data.testPath?.split(/[\\/]/).pop() || 'Unknown',
                status: data.status === 'passed' ? 'PASS' : 'FAIL',
                device_udid: data.deviceUdid || null,
                device_model: data.deviceModel || null,
                android_version: data.androidVersion || null,
                timestamp: data.timestamp instanceof Timestamp 
                    ? data.timestamp.toDate().toISOString() 
                    : new Date().toISOString(),
                duration: data.duration || '0s',
                pass_count: data.passCount || 0,
                fail_count: data.failCount || 0,
                xml_path: '',
                log_html_path: '',
                mtime: data.timestamp instanceof Timestamp ? data.timestamp.toMillis() : Date.now(),
                is_remote: true
            } as TestLog;
        });
    } catch (error) {
        console.error("[Firestore] Failed to fetch global history:", error);
        return [];
    }
}

/**
 * Uploads a local test log to Firestore.
 */
export async function uploadTestToFirebase(uid: string, profileNameOrId: string, log: TestLog): Promise<string | null> {
    if (!db) return null;
    try {
        const historyRef = collection(db, `users/${uid}/history`);
        const docRef = await addDoc(historyRef, {
            runId: log.run_id || null,
            logsPath: profileNameOrId,
            testPath: log.path || '',
            suiteName: log.suite_name || '',
            status: log.status === 'PASS' ? 'passed' : 'failed',
            exitCode: log.status === 'PASS' ? 0 : 1,
            timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
            deviceName: log.device_model || 'Unknown Device',
            deviceModel: log.device_model || null,
            deviceUdid: log.device_udid || null,
            androidVersion: log.android_version || null,
            framework: log.framework || null,
            passCount: log.pass_count || 0,
            failCount: log.fail_count || 0,
            duration: log.duration || '0s'
        });
        console.log("[Sync] Successfully uploaded test log to Firebase. Doc ID:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("[Sync] Failed to upload test log to Firebase:", error);
        return null;
    }
}
