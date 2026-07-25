package com.robotrunner.companion.explorer

import com.robotrunner.companion.inspector.InspectedElement

enum class ExplorerState {
    IDLE,
    RUNNING,
    PAUSED,
    EXHAUSTED,
    STOPPED
}

enum class ElementState {
    UNEXPLORED,
    EXPLORING,
    EXHAUSTED
}

data class ScreenNode(
    val screenId: String,
    val screenName: String,
    val visitCount: Int = 1,
    val firstSeenTimestamp: Long = System.currentTimeMillis(),
    val elements: List<InspectedElement> = emptyList()
)

data class ExplorationAction(
    val id: String,
    val screenId: String,
    val targetElementName: String,
    val actionType: String, // "CLICK", "INPUT", "BACK"
    val timestamp: Long = System.currentTimeMillis()
)

data class ExplorationReport(
    val visitedScreensCount: Int = 0,
    val totalActionsCount: Int = 0,
    val deadEndsHandled: Int = 0,
    val durationMs: Long = 0L,
    val currentState: ExplorerState = ExplorerState.IDLE,
    val activeScreenName: String = "None",
    val discoveredScreens: List<ScreenNode> = emptyList(),
    val actionLog: List<ExplorationAction> = emptyList()
)
