package com.lucasdeeiroz.robotrunner.inspector

import android.content.Context
import android.os.Environment
import android.util.Log
import com.google.gson.GsonBuilder
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.lucasdeeiroz.robotrunner.service.CompanionAccessibilityService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Collections
import java.util.Date
import java.util.Locale

object UiInspectorEngine {

    private val lastCapturedElements = Collections.synchronizedList(mutableListOf<InspectedElement>())
    private val _capturedElementsFlow = MutableStateFlow<List<InspectedElement>>(emptyList())
    val capturedElementsFlow: StateFlow<List<InspectedElement>> = _capturedElementsFlow.asStateFlow()

    private val _recordedStepsFlow = MutableStateFlow<List<RecordedStep>>(emptyList())
    val recordedStepsFlow: StateFlow<List<RecordedStep>> = _recordedStepsFlow.asStateFlow()

    @Volatile
    var lastCapturedScreenName: String = "Active Screen"
        private set

    fun captureActiveUiTree(): List<InspectedElement> {
        lastCapturedElements.clear()
        val list = mutableListOf<InspectedElement>()
        try {
            val service = CompanionAccessibilityService.instance ?: return emptyList()
            val treeJson = service.getInstantUiTreeJson()

            val status = treeJson.get("status")?.asString ?: "empty"
            if (status != "ok") return emptyList()

            val nodesArray = treeJson.getAsJsonArray("nodes") ?: return emptyList()

            for (i in 0 until nodesArray.size()) {
                val item = nodesArray.get(i).asJsonObject
                val text = item.get("text")?.asString ?: ""
                val desc = item.get("contentDescription")?.asString ?: ""
                val resId = (item.get("resourceId") ?: item.get("viewIdResourceName"))?.asString ?: ""
                val clsName = item.get("className")?.asString ?: "android.view.View"
                val pkgName = item.get("packageName")?.asString ?: ""
                val isClickable = (item.get("isClickable") ?: item.get("clickable"))?.asBoolean ?: false
                val isEditable = (item.get("isEditable") ?: item.get("editable"))?.asBoolean ?: false
                val isEnabled = (item.get("isEnabled") ?: item.get("enabled"))?.asBoolean ?: true
                val isFocused = (item.get("isFocused") ?: item.get("focused"))?.asBoolean ?: false
                val isScrollable = (item.get("isScrollable") ?: item.get("scrollable"))?.asBoolean ?: false
                val depth = item.get("depth")?.asInt ?: 0

                val boundsStr = try {
                    val boundsElem = item.get("bounds")
                    if (boundsElem != null && boundsElem.isJsonObject) {
                        val bObj = boundsElem.asJsonObject
                        val l = bObj.get("left")?.asInt ?: 0
                        val t = bObj.get("top")?.asInt ?: 0
                        val r = bObj.get("right")?.asInt ?: 0
                        val b = bObj.get("bottom")?.asInt ?: 0
                        "[$l,$t][$r,$b]"
                    } else if (boundsElem != null && boundsElem.isJsonPrimitive) {
                        boundsElem.asString
                    } else {
                        "[0,0][0,0]"
                    }
                } catch (e: Exception) {
                    "[0,0][0,0]"
                }

                val name = when {
                    text.isNotBlank() -> text.trim()
                    desc.isNotBlank() -> desc.trim()
                    resId.isNotBlank() -> resId.substringAfterLast('/')
                    else -> clsName.substringAfterLast('.')
                }

                val accId = when {
                    desc.isNotBlank() -> desc.trim()
                    text.isNotBlank() -> text.trim()
                    else -> ""
                }

                val uiSel = when {
                    desc.isNotBlank() -> "new UiSelector().description(\"${desc.trim()}\")"
                    text.isNotBlank() -> "new UiSelector().text(\"${text.trim()}\")"
                    resId.isNotBlank() -> "new UiSelector().resourceId(\"$resId\")"
                    else -> "new UiSelector().className(\"$clsName\")"
                }

                val xpath = when {
                    desc.isNotBlank() -> "//$clsName[@content-desc=\"${desc.trim()}\"]"
                    text.isNotBlank() -> "//$clsName[@text=\"${text.trim()}\"]"
                    resId.isNotBlank() -> "//$clsName[@resource-id=\"$resId\"]"
                    else -> "//$clsName"
                }

                val element = InspectedElement(
                    id = "el_${i + 1}",
                    name = name,
                    className = clsName,
                    packageName = pkgName,
                    text = text,
                    contentDescription = desc,
                    resourceId = resId,
                    bounds = boundsStr,
                    accessibilityId = accId,
                    uiSelector = uiSel,
                    xpath = xpath,
                    isClickable = isClickable,
                    isEditable = isEditable,
                    isEnabled = isEnabled,
                    isFocused = isFocused,
                    isScrollable = isScrollable,
                    depth = depth
                )
                list.add(element)
            }

            synchronized(lastCapturedElements) {
                lastCapturedElements.addAll(list)
            }
            _capturedElementsFlow.value = list
        } catch (e: Exception) {
            Log.e("UiInspectorEngine", "Error capturing active UI tree", e)
        }
        return list
    }

    fun getCapturedElementsSnapshot(): List<InspectedElement> {
        return synchronized(lastCapturedElements) { ArrayList(lastCapturedElements) }
    }

    fun addRecordedStep(step: RecordedStep) {
        val current = _recordedStepsFlow.value.toMutableList()
        current.add(step)
        _recordedStepsFlow.value = current
    }

    fun deleteRecordedStep(stepId: String) {
        val current = _recordedStepsFlow.value.toMutableList()
        current.removeAll { it.id == stepId }
        _recordedStepsFlow.value = current
    }

    fun clearRecordedSteps() {
        _recordedStepsFlow.value = emptyList()
    }

    fun generateRobotSnippet(): String {
        val steps = _recordedStepsFlow.value
        if (steps.isEmpty()) return ""

        val sb = StringBuilder()
        sb.append("*** Settings ***\n")
        sb.append("Documentation    Recorded test scenario via Robot Runner Companion UI Inspector\n")
        sb.append("Library          AppiumLibrary\n\n")
        sb.append("*** Test Cases ***\n")
        sb.append("Cenário de Teste Gravado no Dispositivo\n")
        sb.append("    [Documentation]    Sequência de passos gravados diretamente na tela do dispositivo\n")

        steps.forEach { step ->
            when (step.actionType.lowercase()) {
                "click", "tap" -> {
                    sb.append("    Wait Until Element Is Visible    ${step.locator}    15\n")
                    sb.append("    Click Element    ${step.locator}\n")
                }
                "input", "set_text" -> {
                    val inputVal = step.argument ?: ""
                    sb.append("    Wait Until Element Is Visible    ${step.locator}    15\n")
                    sb.append("    Input Text    ${step.locator}    $inputVal\n")
                }
                "wait", "wait_visible" -> {
                    sb.append("    Wait Until Element Is Visible    ${step.locator}    15\n")
                }
                "assert", "assert_text" -> {
                    val expected = step.argument ?: ""
                    sb.append("    Wait Until Element Is Visible    ${step.locator}    15\n")
                    sb.append("    Element Text Should Be    ${step.locator}    $expected\n")
                }
                else -> {
                    sb.append("    # Action: ${step.actionType} on ${step.locator}\n")
                }
            }
        }
        return sb.toString()
    }

    private val _pendingSnippetForDesktop = MutableStateFlow<String?>(null)
    val pendingSnippetForDesktop: StateFlow<String?> = _pendingSnippetForDesktop.asStateFlow()

    fun queueSnippetForDesktop(snippet: String) {
        _pendingSnippetForDesktop.value = snippet
    }

    fun getAndConsumePendingSnippet(): String? {
        val snippet = _pendingSnippetForDesktop.value
        _pendingSnippetForDesktop.value = null
        return snippet
    }

    suspend fun exportRobotSnippetToFile(): File? = withContext(Dispatchers.IO) {
        try {
            val snippet = generateRobotSnippet()
            if (snippet.isBlank()) return@withContext null

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val fileName = "snippet_$timeStamp.robot"
            val file = File(downloadsDir, fileName)

            FileOutputStream(file).use { out ->
                out.write(snippet.toByteArray(Charsets.UTF_8))
            }
            file
        } catch (e: Exception) {
            Log.e("UiInspectorEngine", "Error exporting Robot snippet to file", e)
            null
        }
    }

    suspend fun exportUiElementMapJson(screenName: String): File? = withContext(Dispatchers.IO) {
        try {
            val elementsSnapshot = getCapturedElementsSnapshot()
            val mapElements = elementsSnapshot.map { el ->
                UiMapElement(
                    id = el.xpath,
                    name = el.name,
                    type = if (el.isEditable) "input" else if (el.isClickable) "button" else "view",
                    accessibilityId = if (el.accessibilityId.isNotBlank()) el.accessibilityId else null,
                    androidId = if (el.resourceId.isNotBlank()) el.resourceId else null,
                    text = if (el.text.isNotBlank()) el.text else null,
                    description = if (el.contentDescription.isNotBlank()) el.contentDescription else null,
                    xpath = el.xpath
                )
            }

            val cleanScreenId = screenName.lowercase().replace("[^a-z0-9_]".toRegex(), "_")
            val map = UiElementMap(
                version = "2.0",
                screenId = cleanScreenId,
                screenName = screenName,
                elements = mapElements
            )

            val gson = GsonBuilder().setPrettyPrinting().create()
            val jsonStr = gson.toJson(map)

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val fileName = "map_${cleanScreenId}_$timeStamp.json"
            val file = File(downloadsDir, fileName)

            FileOutputStream(file).use { out ->
                out.write(jsonStr.toByteArray())
            }
            file
        } catch (e: Exception) {
            Log.e("UiInspectorEngine", "Error exporting UI element map JSON", e)
            null
        }
    }

    suspend fun exportUiDumpJson(): File? = withContext(Dispatchers.IO) {
        try {
            val service = CompanionAccessibilityService.instance ?: return@withContext null
            val treeJson = service.getInstantUiTreeJson()

            val gson = GsonBuilder().setPrettyPrinting().create()
            val jsonStr = gson.toJson(treeJson)

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val timeStamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault()).format(Date())
            val fileName = "ui_dump_$timeStamp.json"
            val file = File(downloadsDir, fileName)

            FileOutputStream(file).use { out ->
                out.write(jsonStr.toByteArray())
            }
            file
        } catch (e: Exception) {
            Log.e("UiInspectorEngine", "Error exporting UI dump JSON", e)
            null
        }
    }
}

