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
import java.util.Collections

object UiInspectorEngine {

    private val lastCapturedElements = Collections.synchronizedList(mutableListOf<InspectedElement>())
    private val _capturedElementsFlow = MutableStateFlow<List<InspectedElement>>(emptyList())
    val capturedElementsFlow: StateFlow<List<InspectedElement>> = _capturedElementsFlow.asStateFlow()
    
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
                val isClickable = (item.get("isClickable") ?: item.get("clickable"))?.asBoolean ?: false
                val isEditable = (item.get("isEditable") ?: item.get("editable"))?.asBoolean ?: false

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
                    text.isNotBlank() -> text
                    desc.isNotBlank() -> desc
                    resId.isNotBlank() -> resId.substringAfterLast('/')
                    else -> clsName.substringAfterLast('.')
                }

                val accId = when {
                    desc.isNotBlank() -> desc
                    text.isNotBlank() -> text
                    else -> ""
                }

                val uiSel = when {
                    desc.isNotBlank() -> "new UiSelector().description(\"$desc\")"
                    text.isNotBlank() -> "new UiSelector().text(\"$text\")"
                    resId.isNotBlank() -> "new UiSelector().resourceId(\"$resId\")"
                    else -> "new UiSelector().className(\"$clsName\")"
                }

                val xpath = when {
                    desc.isNotBlank() -> "//$clsName[@content-desc=\"$desc\"]"
                    text.isNotBlank() -> "//$clsName[@text=\"$text\"]"
                    resId.isNotBlank() -> "//$clsName[@resource-id=\"$resId\"]"
                    else -> "//$clsName"
                }

                val element = InspectedElement(
                    id = "el_${i + 1}",
                    name = name,
                    className = clsName,
                    text = text,
                    contentDescription = desc,
                    resourceId = resId,
                    bounds = boundsStr,
                    accessibilityId = accId,
                    uiSelector = uiSel,
                    xpath = xpath,
                    isClickable = isClickable,
                    isEditable = isEditable
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

            val map = UiElementMap(
                version = "2.0",
                screenId = screenName.lowercase().replace(" ", "_"),
                screenName = screenName,
                elements = mapElements
            )

            val gson = GsonBuilder().setPrettyPrinting().create()
            val jsonStr = gson.toJson(map)

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val fileName = "map_${map.screenId}.json"
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
}
