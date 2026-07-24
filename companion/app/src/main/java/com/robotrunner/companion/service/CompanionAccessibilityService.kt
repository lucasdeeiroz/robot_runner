package com.robotrunner.companion.service

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import java.util.concurrent.ConcurrentLinkedQueue

class CompanionAccessibilityService : AccessibilityService() {

    companion object {
        var instance: CompanionAccessibilityService? = null
            private set

        val isRunning: Boolean
            get() = instance != null

        private const val MAX_RECENT_EVENTS = 50
        val recentEvents = ConcurrentLinkedQueue<CompanionEvent>()
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i("CompanionAccessibility", "Companion Accessibility Service connected!")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        when (event.eventType) {
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED -> {
                val textList = event.text
                if (!textList.isNullOrEmpty()) {
                    val toastMessage = textList.joinToString(" ")
                    val packageName = event.packageName?.toString() ?: "unknown"
                    Log.i("CompanionAccessibility", "Toast/Notification captured from $packageName: $toastMessage")
                    
                    val evt = CompanionEvent(
                        type = "toast",
                        packageName = packageName,
                        message = toastMessage,
                        timestamp = System.currentTimeMillis()
                    )
                    recentEvents.add(evt)
                    if (recentEvents.size > MAX_RECENT_EVENTS) {
                        recentEvents.poll()
                    }
                }
            }
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val className = event.className?.toString() ?: ""
                val packageName = event.packageName?.toString() ?: ""
                if (className.contains("Dialog") || className.contains("Alert")) {
                    val evt = CompanionEvent(
                        type = "dialog",
                        packageName = packageName,
                        message = "Dialog window opened: $className",
                        timestamp = System.currentTimeMillis()
                    )
                    recentEvents.add(evt)
                    if (recentEvents.size > MAX_RECENT_EVENTS) {
                        recentEvents.poll()
                    }
                }
            }
        }
    }

    override fun onInterrupt() {
        Log.w("CompanionAccessibility", "Companion Accessibility Service interrupted")
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    fun getInstantUiTreeJson(): JsonObject {
        val root = rootInActiveWindow
        val rootObj = JsonObject()
        rootObj.addProperty("timestamp", System.currentTimeMillis())

        if (root == null) {
            rootObj.addProperty("status", "empty")
            rootObj.addProperty("message", "No active window root node available")
            return rootObj
        }

        rootObj.addProperty("status", "ok")
        val nodesArray = JsonArray()
        traverseNode(root, nodesArray, 0)
        rootObj.add("nodes", nodesArray)
        return rootObj
    }

    private fun traverseNode(node: AccessibilityNodeInfo, array: JsonArray, depth: Int) {
        val nodeObj = JsonObject()
        nodeObj.addProperty("className", node.className?.toString() ?: "")
        nodeObj.addProperty("packageName", node.packageName?.toString() ?: "")
        nodeObj.addProperty("text", node.text?.toString() ?: "")
        nodeObj.addProperty("contentDescription", node.contentDescription?.toString() ?: "")
        nodeObj.addProperty("resourceId", node.viewIdResourceName ?: "")
        nodeObj.addProperty("isClickable", node.isClickable)
        nodeObj.addProperty("isEnabled", node.isEnabled)
        nodeObj.addProperty("isFocused", node.isFocused)
        nodeObj.addProperty("isScrollable", node.isScrollable)
        nodeObj.addProperty("depth", depth)

        val rect = android.graphics.Rect()
        node.getBoundsInScreen(rect)
        val boundsObj = JsonObject().apply {
            addProperty("left", rect.left)
            addProperty("top", rect.top)
            addProperty("right", rect.right)
            addProperty("bottom", rect.bottom)
        }
        nodeObj.add("bounds", boundsObj)

        array.add(nodeObj)

        for (i in 0 until node.childCount) {
            val child = node.getChild(i)
            if (child != null) {
                traverseNode(child, array, depth + 1)
            }
        }
    }
}

data class CompanionEvent(
    val type: String,
    val packageName: String,
    val message: String,
    val timestamp: Long
)
