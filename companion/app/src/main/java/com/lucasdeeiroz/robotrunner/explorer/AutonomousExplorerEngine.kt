package com.lucasdeeiroz.robotrunner.explorer

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.os.Environment
import android.util.Log
import com.google.gson.GsonBuilder
import com.lucasdeeiroz.robotrunner.inspector.InspectedElement
import com.lucasdeeiroz.robotrunner.inspector.UiElementMap
import com.lucasdeeiroz.robotrunner.inspector.UiInspectorEngine
import com.lucasdeeiroz.robotrunner.inspector.UiMapElement
import com.lucasdeeiroz.robotrunner.service.CompanionAccessibilityService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.io.FileOutputStream
import java.util.Collections

object AutonomousExplorerEngine {

    private var explorationJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val visitedElementIds = Collections.synchronizedSet(HashSet<String>())
    private val screenVisitCountMap = Collections.synchronizedMap(HashMap<String, Int>())
    private val discoveredScreensMap = Collections.synchronizedMap(LinkedHashMap<String, ScreenNode>())
    private val actionLogList = Collections.synchronizedList(mutableListOf<ExplorationAction>())

    private var startTimeMs: Long = 0L
    private var deadEndsHandledCount: Int = 0

    @Volatile
    var targetPackageName: String? = null

    @Volatile
    var currentState: ExplorerState = ExplorerState.IDLE
        private set

    @Volatile
    var currentScreenName: String = "None"
        private set

    private val _reportFlow = MutableStateFlow(ExplorationReport())
    val reportFlow: StateFlow<ExplorationReport> = _reportFlow.asStateFlow()

    fun startExploration(targetPackage: String? = null, maxSteps: Int = 200) {
        if (currentState == ExplorerState.RUNNING) return

        if (!targetPackage.isNullOrBlank()) {
            targetPackageName = targetPackage.trim()
        }

        currentState = ExplorerState.RUNNING
        startTimeMs = System.currentTimeMillis()
        deadEndsHandledCount = 0

        explorationJob = scope.launch {
            try {
                var stepCount = 0
                while (isActive && currentState == ExplorerState.RUNNING && stepCount < maxSteps) {
                    stepCount++
                    executeExplorationStep()
                    delay(2000L) // 2-second pacing per exploration action
                }
                if (stepCount >= maxSteps) {
                    currentState = ExplorerState.EXHAUSTED
                }
            } catch (e: CancellationException) {
                currentState = ExplorerState.STOPPED
            } catch (e: Exception) {
                Log.e("AutonomousExplorer", "Error in exploration loop", e)
                currentState = ExplorerState.STOPPED
            } finally {
                emitReport()
            }
        }
        emitReport()
    }

    fun pauseExploration() {
        if (currentState == ExplorerState.RUNNING) {
            currentState = ExplorerState.PAUSED
            explorationJob?.cancel()
            emitReport()
        }
    }

    fun stopExploration() {
        currentState = ExplorerState.STOPPED
        explorationJob?.cancel()
        emitReport()
    }

    fun resetState() {
        stopExploration()
        visitedElementIds.clear()
        screenVisitCountMap.clear()
        discoveredScreensMap.clear()
        actionLogList.clear()
        deadEndsHandledCount = 0
        currentScreenName = "None"
        targetPackageName = null
        currentState = ExplorerState.IDLE
        emitReport()
    }

    private suspend fun executeExplorationStep() {
        val service = CompanionAccessibilityService.instance ?: return
        val activePackage = CompanionAccessibilityService.activePackageName

        // Guard: Re-route back to target package if exploration escaped target app
        if (!targetPackageName.isNullOrEmpty() && !activePackage.isNullOrEmpty() &&
            !activePackage.equals(targetPackageName, ignoreCase = true)
        ) {
            try {
                val launchIntent = service.packageManager.getLaunchIntentForPackage(targetPackageName!!)
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    service.startActivity(launchIntent)
                } else {
                    service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
                }
            } catch (e: Exception) {
                service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            }
            delay(1500L)
            return
        }

        val elements = UiInspectorEngine.captureActiveUiTree()
        if (elements.isEmpty()) return

        val pkgName = activePackage ?: targetPackageName ?: "target_app"
        val topTexts = elements.map { it.name }.filter { it.isNotBlank() }.take(3).joinToString("_")
        val screenId = "${pkgName}_${topTexts.lowercase().replace(" ", "_")}"
        val screenName = topTexts.ifBlank { pkgName }
        currentScreenName = screenName

        // Update Screen Node in DFS Graph
        val visitCount = (screenVisitCountMap[screenId] ?: 0) + 1
        screenVisitCountMap[screenId] = visitCount

        if (!discoveredScreensMap.containsKey(screenId)) {
            val node = ScreenNode(
                screenId = screenId,
                screenName = screenName,
                visitCount = visitCount,
                elements = elements
            )
            discoveredScreensMap[screenId] = node
        } else {
            val existing = discoveredScreensMap[screenId]!!
            discoveredScreensMap[screenId] = existing.copy(visitCount = visitCount)
        }

        // Find unvisited interactive target element
        val unvisitedTarget = elements.firstOrNull { el ->
            (el.isClickable || el.isEditable) && !visitedElementIds.contains(el.xpath) && !visitedElementIds.contains(el.id)
        }

        if (unvisitedTarget != null) {
            val actionKey = unvisitedTarget.xpath.ifBlank { unvisitedTarget.id }
            visitedElementIds.add(actionKey)

            val actionType = if (unvisitedTarget.isEditable) "INPUT" else "CLICK"
            val success = service.performNodeActionByMatch(
                resourceId = unvisitedTarget.resourceId.ifBlank { null },
                textMatch = unvisitedTarget.text.ifBlank { null },
                contentDescMatch = unvisitedTarget.contentDescription.ifBlank { null }
            )

            val action = ExplorationAction(
                id = "act_${actionLogList.size + 1}",
                screenId = screenId,
                targetElementName = unvisitedTarget.name,
                actionType = if (success) actionType else "$actionType (Failed)"
            )
            actionLogList.add(action)
        } else {
            // Dead End reached for this screen node -> Execute BACK gesture
            deadEndsHandledCount++
            service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)

            val action = ExplorationAction(
                id = "act_${actionLogList.size + 1}",
                screenId = screenId,
                targetElementName = "Dead End Screen",
                actionType = "BACK"
            )
            actionLogList.add(action)
        }

        emitReport()
    }

    private fun emitReport() {
        val duration = if (startTimeMs > 0) System.currentTimeMillis() - startTimeMs else 0L
        val screensSnapshot = synchronized(discoveredScreensMap) { ArrayList(discoveredScreensMap.values) }
        val actionsSnapshot = synchronized(actionLogList) { ArrayList(actionLogList) }

        val report = ExplorationReport(
            visitedScreensCount = screensSnapshot.size,
            totalActionsCount = actionsSnapshot.size,
            deadEndsHandled = deadEndsHandledCount,
            durationMs = duration,
            currentState = currentState,
            activeScreenName = currentScreenName,
            discoveredScreens = screensSnapshot,
            actionLog = actionsSnapshot.takeLast(20)
        )
        _reportFlow.value = report
    }

    suspend fun exportExplorationMapJson(): File? = withContext(Dispatchers.IO) {
        try {
            val screensSnapshot = synchronized(discoveredScreensMap) { ArrayList(discoveredScreensMap.values) }
            val mapElements = screensSnapshot.flatMap { screen ->
                screen.elements.map { el ->
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
            }

            val map = UiElementMap(
                version = "2.0",
                screenId = "dfs_explored_graph",
                screenName = "Autonomous DFS Explored Graph",
                elements = mapElements
            )

            val gson = GsonBuilder().setPrettyPrinting().create()
            val jsonStr = gson.toJson(map)

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val fileName = "map_dfs_explored_${System.currentTimeMillis()}.json"
            val file = File(downloadsDir, fileName)

            FileOutputStream(file).use { out ->
                out.write(jsonStr.toByteArray())
            }
            file
        } catch (e: Exception) {
            Log.e("AutonomousExplorer", "Error exporting DFS exploration map JSON", e)
            null
        }
    }
}
