import { collection, query, orderBy, limit, getDocs, Timestamp, where } from 'firebase/firestore';
import { db } from './firebase';
import { TestLog } from './historyCache';

/**
 * Fetches the global test history for a specific user from Firestore, 
 * filtered by the current logs path (Project/Profile).
 */
export async function fetchGlobalHistory(uid: string, profileId: string, maxItems: number = 50): Promise<TestLog[]> {
    try {
        const historyRef = collection(db, `users/${uid}/history`);
        
        console.log("[Firestore] Fetching history for Profile ID:", profileId);

        const q = query(
            historyRef, 
            where('logsPath', '==', profileId),
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
