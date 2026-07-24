package com.robotrunner.companion.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
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

    fun performTap(x: Float, y: Float): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val path = Path().apply {
                moveTo(x, y)
            }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, 50))
                .build()
            return dispatchGesture(gesture, null, null)
        }
        return false
    }

    fun performNodeActionByMatch(
        resourceId: String? = null,
        textMatch: String? = null,
        contentDescMatch: String? = null,
        action: String = "click",
        textValue: String? = null
    ): Boolean {
        var root = rootInActiveWindow
        if (root == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                val activeWindows = windows
                if (activeWindows != null) {
                    for (w in activeWindows) {
                        if (w.root != null && w.isFocused) {
                            root = w.root
                            break
                        }
                    }
                    if (root == null) {
                        for (w in activeWindows) {
                            if (w.root != null) {
                                root = w.root
                                break
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w("CompanionAccessibility", "Error checking windows for node action", e)
            }
        }
        if (root == null) return false

        val targetNode = findMatchingNode(root, resourceId, textMatch, contentDescMatch)
        if (targetNode != null) {
            return when (action.lowercase()) {
                "click", "tap" -> {
                    var curr: AccessibilityNodeInfo? = targetNode
                    var clicked = false
                    while (curr != null) {
                        if (curr.isClickable) {
                            clicked = curr.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                            if (clicked) break
                        }
                        curr = curr.parent
                    }
                    if (!clicked) {
                        targetNode.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    } else true
                }
                "input", "set_text" -> {
                    if (textValue != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        val args = android.os.Bundle().apply {
                            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, textValue)
                        }
                        targetNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                    } else false
                }
                "scroll_forward" -> targetNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)
                "scroll_backward" -> targetNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)
                else -> false
            }
        }
        return false
    }

    private fun findMatchingNode(
        node: AccessibilityNodeInfo,
        resourceId: String?,
        textMatch: String?,
        contentDescMatch: String?
    ): AccessibilityNodeInfo? {
        if (!resourceId.isNullOrEmpty() && node.viewIdResourceName?.equals(resourceId, ignoreCase = true) == true) {
            return node
        }
        if (!textMatch.isNullOrEmpty() && node.text?.toString()?.contains(textMatch, ignoreCase = true) == true) {
            return node
        }
        if (!contentDescMatch.isNullOrEmpty() && node.contentDescription?.toString()?.contains(contentDescMatch, ignoreCase = true) == true) {
            return node
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val match = findMatchingNode(child, resourceId, textMatch, contentDescMatch)
            if (match != null) return match
        }
        return null
    }

    fun takeInstantScreenshot(onComplete: (ByteArray?) -> Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            takeScreenshot(
                android.view.Display.DEFAULT_DISPLAY,
                mainExecutor,
                object : TakeScreenshotCallback {
                    override fun onSuccess(screenshot: ScreenshotResult) {
                        try {
                            val hardwareBuffer = screenshot.hardwareBuffer
                            val colorSpace = screenshot.colorSpace
                            val bitmap = android.graphics.Bitmap.wrapHardwareBuffer(hardwareBuffer, colorSpace)
                            hardwareBuffer.close()

                            if (bitmap != null) {
                                val stream = java.io.ByteArrayOutputStream()
                                bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, stream)
                                bitmap.recycle()
                                onComplete(stream.toByteArray())
                                return
                            }
                        } catch (e: Exception) {
                            Log.e("CompanionAccessibility", "Error compressing hardware screenshot", e)
                        }
                        takeInternalScreencapFallback(onComplete)
                    }

                    override fun onFailure(errorCode: Int) {
                        Log.w("CompanionAccessibility", "takeScreenshot failed with error $errorCode, trying internal fallback")
                        takeInternalScreencapFallback(onComplete)
                    }
                }
            )
        } else {
            takeInternalScreencapFallback(onComplete)
        }
    }

    private fun takeInternalScreencapFallback(onComplete: (ByteArray?) -> Unit) {
        Thread {
            try {
                val process = Runtime.getRuntime().exec("screencap -p")
                val bytes = process.inputStream.readBytes()
                process.waitFor()
                if (bytes.isNotEmpty()) {
                    val bitmap = android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                    if (bitmap != null) {
                        val stream = java.io.ByteArrayOutputStream()
                        bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 70, stream)
                        bitmap.recycle()
                        onComplete(stream.toByteArray())
                        return@Thread
                    }
                }
            } catch (e: Exception) {
                Log.e("CompanionAccessibility", "Internal screencap fallback failed", e)
            }
            onComplete(null)
        }.start()
    }

    fun takeDownscaledJpegFrame(targetWidth: Int = 720, quality: Int = 60, onComplete: (ByteArray?) -> Unit) {
        takeInstantScreenshot { rawJpeg ->
            if (rawJpeg == null || rawJpeg.isEmpty()) {
                onComplete(null)
                return@takeInstantScreenshot
            }
            try {
                val opts = android.graphics.BitmapFactory.Options()
                opts.inJustDecodeBounds = true
                android.graphics.BitmapFactory.decodeByteArray(rawJpeg, 0, rawJpeg.size, opts)

                val origW = opts.outWidth
                if (origW <= 0) {
                    onComplete(rawJpeg)
                    return@takeInstantScreenshot
                }

                var sampleSize = 1
                while (origW / (sampleSize * 2) >= targetWidth) {
                    sampleSize *= 2
                }

                val decodeOpts = android.graphics.BitmapFactory.Options().apply {
                    inSampleSize = sampleSize
                }
                val sampledBitmap = android.graphics.BitmapFactory.decodeByteArray(rawJpeg, 0, rawJpeg.size, decodeOpts)
                if (sampledBitmap != null) {
                    val stream = java.io.ByteArrayOutputStream()
                    sampledBitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, quality, stream)
                    sampledBitmap.recycle()
                    onComplete(stream.toByteArray())
                    return@takeInstantScreenshot
                }
            } catch (e: Exception) {
                Log.e("CompanionAccessibility", "Error downscaling screenshot frame", e)
            }
            onComplete(rawJpeg)
        }
    }

    fun getInstantUiTreeJson(): JsonObject {
        var root = rootInActiveWindow
        if (root == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                val activeWindows = windows
                if (activeWindows != null) {
                    for (w in activeWindows) {
                        if (w.root != null && w.isFocused) {
                            root = w.root
                            break
                        }
                    }
                    if (root == null) {
                        for (w in activeWindows) {
                            if (w.root != null) {
                                root = w.root
                                break
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.w("CompanionAccessibility", "Error iterating interactive windows", e)
            }
        }

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
