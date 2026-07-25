package com.robotrunner.companion.sync

import android.content.Context
import android.os.Environment
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

class SyncManager(private val context: Context) {

    suspend fun listLocalArtifacts(): List<ArtifactItem> = withContext(Dispatchers.IO) {
        val list = mutableListOf<ArtifactItem>()
        try {
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (downloadsDir.exists() && downloadsDir.isDirectory) {
                downloadsDir.listFiles()?.forEach { file ->
                    val category = when {
                        file.name.startsWith("map_") && file.name.endsWith(".json") -> ArtifactCategory.UI_MAP
                        file.name.startsWith("golden_") && file.name.endsWith(".json") -> ArtifactCategory.GOLDEN_FILE
                        file.name.startsWith("suite_") && file.name.endsWith(".json") -> ArtifactCategory.TEST_SUITE
                        file.name.startsWith("report_") && (file.name.endsWith(".html") || file.name.endsWith(".json")) -> ArtifactCategory.AUDIT_REPORT
                        file.name.startsWith("audit_report_") && file.name.endsWith(".pdf") -> ArtifactCategory.PDF_REPORT
                        else -> null
                    }
                    if (category != null) {
                        list.add(
                            ArtifactItem(
                                name = file.name,
                                path = file.absolutePath,
                                category = category,
                                sizeBytes = file.length(),
                                lastModifiedMs = file.lastModified()
                            )
                        )
                    }
                }
            }
        } catch (e: Exception) {
            Log.e("SyncManager", "Error listing local artifacts", e)
        }
        list.sortedByDescending { it.lastModifiedMs }
    }

    suspend fun processPushPayload(payload: PushPayload): File? = withContext(Dispatchers.IO) {
        try {
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val fileName = if (payload.fileName.isNotBlank()) payload.fileName else "pushed_${System.currentTimeMillis()}.json"
            val file = File(downloadsDir, fileName)

            FileOutputStream(file).use { out ->
                out.write(payload.contentJson.toByteArray())
            }
            Log.i("SyncManager", "Processed incoming desktop push payload: ${file.absolutePath}")
            file
        } catch (e: Exception) {
            Log.e("SyncManager", "Error processing push payload", e)
            null
        }
    }

    suspend fun deleteArtifact(path: String): Boolean = withContext(Dispatchers.IO) {
        try {
            val file = File(path)
            if (file.exists()) file.delete() else false
        } catch (e: Exception) {
            Log.e("SyncManager", "Error deleting artifact: $path", e)
            false
        }
    }
}
