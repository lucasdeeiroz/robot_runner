package com.robotrunner.companion.checkup

import android.content.Context
import android.os.Environment
import android.util.Log
import com.google.gson.GsonBuilder
import com.robotrunner.companion.inspector.UiInspectorEngine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

data class GoldenText(
    val id: String,
    val text: String,
    val description: String? = null
)

data class GoldenFileSchema(
    val version: String = "2.0",
    val screenId: String,
    val screenName: String,
    val expectedTexts: List<GoldenText>
)

data class UiTextVerificationResult(
    val timestamp: Long = System.currentTimeMillis(),
    val screenName: String,
    val totalExpected: Int,
    val totalMatched: Int,
    val matchPercentage: Double,
    val matchedTexts: List<String>,
    val missingTexts: List<String>,
    val unexpectedTexts: List<String>
)

object UiTextVerifier {

    fun verifyActiveScreenText(goldenFile: GoldenFileSchema? = null): UiTextVerificationResult {
        val capturedElements = UiInspectorEngine.captureActiveUiTree()
        val extractedTexts = capturedElements
            .flatMap { listOf(it.text, it.contentDescription) }
            .filter { it.isNotBlank() }
            .distinct()

        if (goldenFile == null || goldenFile.expectedTexts.isEmpty()) {
            return UiTextVerificationResult(
                screenName = "Active Screen",
                totalExpected = extractedTexts.size,
                totalMatched = extractedTexts.size,
                matchPercentage = 100.0,
                matchedTexts = extractedTexts,
                missingTexts = emptyList(),
                unexpectedTexts = emptyList()
            )
        }

        val expectedList = goldenFile.expectedTexts.map { it.text }
        val matchedList = extractedTexts.filter { expectedList.contains(it) }
        val missingList = expectedList.filter { !extractedTexts.contains(it) }
        val unexpectedList = extractedTexts.filter { !expectedList.contains(it) }

        val matchPct = if (expectedList.isNotEmpty()) (matchedList.size.toDouble() / expectedList.size.toDouble()) * 100.0 else 100.0

        return UiTextVerificationResult(
            screenName = goldenFile.screenName,
            totalExpected = expectedList.size,
            totalMatched = matchedList.size,
            matchPercentage = Math.round(matchPct * 10.0) / 10.0,
            matchedTexts = matchedList,
            missingTexts = missingList,
            unexpectedTexts = unexpectedList
        )
    }

    suspend fun exportGoldenFileJson(screenName: String): File? = withContext(Dispatchers.IO) {
        try {
            val capturedElements = UiInspectorEngine.captureActiveUiTree()
            val goldenTexts = capturedElements
                .filter { it.text.isNotBlank() || it.contentDescription.isNotBlank() }
                .mapIndexed { idx, el ->
                    GoldenText(
                        id = "txt_${idx + 1}",
                        text = el.text.ifBlank { el.contentDescription },
                        description = el.name
                    )
                }

            val schema = GoldenFileSchema(
                version = "2.0",
                screenId = screenName.lowercase().replace(" ", "_"),
                screenName = screenName,
                expectedTexts = goldenTexts
            )

            val gson = GsonBuilder().setPrettyPrinting().create()
            val jsonStr = gson.toJson(schema)

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val fileName = "golden_${schema.screenId}.json"
            val file = File(downloadsDir, fileName)

            FileOutputStream(file).use { out ->
                out.write(jsonStr.toByteArray())
            }
            file
        } catch (e: Exception) {
            Log.e("UiTextVerifier", "Error exporting Golden File JSON", e)
            null
        }
    }
}
