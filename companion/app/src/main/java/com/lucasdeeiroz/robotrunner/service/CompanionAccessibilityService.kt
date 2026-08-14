package com.lucasdeeiroz.robotrunner.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import kotlinx.coroutines.delay
import java.util.concurrent.ConcurrentLinkedQueue

class CompanionAccessibilityService : AccessibilityService() {

    companion object {
        var instance: CompanionAccessibilityService? = null
            private set

        val isRunning: Boolean
            get() = instance != null

        private const val MAX_RECENT_EVENTS = 50
        val recentEvents = ConcurrentLinkedQueue<CompanionEvent>()
        var activePackageName: String? = null

        @Volatile var lastTouchTimestamp: Long = 0
        @Volatile var lastRedrawTimestamp: Long = 0
        @Volatile var lastFrameRedrawDeltaMs: Long = 0
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i("CompanionAccessibility", "Companion Accessibility Service connected!")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        if (event.packageName != null) {
            activePackageName = event.packageName.toString()
        }

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
                val evt = CompanionEvent(
                    type = if (className.contains("Dialog") || className.contains("Alert")) "dialog" else "window_state",
                    packageName = packageName,
                    message = "Window state changed: $className",
                    timestamp = System.currentTimeMillis()
                )
                recentEvents.add(evt)
                if (recentEvents.size > MAX_RECENT_EVENTS) {
                    recentEvents.poll()
                }
            }
            AccessibilityEvent.TYPE_VIEW_CLICKED,
            AccessibilityEvent.TYPE_VIEW_SELECTED,
            AccessibilityEvent.TYPE_VIEW_FOCUSED,
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED,
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> {
                val packageName = event.packageName?.toString() ?: ""
                lastTouchTimestamp = System.currentTimeMillis()
                val evt = CompanionEvent(
                    type = "touch",
                    packageName = packageName,
                    message = "User interaction event registered on ${event.className}",
                    timestamp = lastTouchTimestamp
                )
                recentEvents.add(evt)
                if (recentEvents.size > MAX_RECENT_EVENTS) {
                    recentEvents.poll()
                }
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                val now = System.currentTimeMillis()
                lastRedrawTimestamp = now
                if (lastTouchTimestamp > 0 && now >= lastTouchTimestamp) {
                    val delta = now - lastTouchTimestamp
                    if (delta in 1..10000) {
                        lastFrameRedrawDeltaMs = delta
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
        lastTouchTimestamp = System.currentTimeMillis()
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
        lastTouchTimestamp = System.currentTimeMillis()
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
        try {
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

            val childCount = try { node.childCount } catch (e: Exception) { 0 }
            for (i in 0 until childCount) {
                val child = try { node.getChild(i) } catch (e: Exception) { null }
                if (child != null) {
                    traverseNode(child, array, depth + 1)
                }
            }
        } catch (e: Exception) {
            Log.w("CompanionAccessibility", "Error traversing AccessibilityNodeInfo", e)
        }
    }

    suspend fun forceStopPackageViaSettings(context: Context, targetPackage: String, log: (String) -> Unit): Boolean {
        if (targetPackage.isBlank()) return false
        log("  -> [Force Stop via Settings] Opening App Settings for: $targetPackage")

        try {
            // 1. Launch Settings App Details Screen
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", targetPackage, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            context.startActivity(intent)

            // 2. Poll for the Force Stop button in Settings window (max 3 seconds)
            val startTime = System.currentTimeMillis()
            var buttonClicked = false
            val forceStopKeywords = listOf(
                "force_stop", "force_stop_button", "right_button", "button2",
                "forçar parada", "forçar interrupção", "force stop", "detener",
                "forzar detención", "interromper", "forzar detencion", "arreter", "stoppen erzwingen"
            )

            while (System.currentTimeMillis() - startTime < 3500 && !buttonClicked) {
                delay(100)
                val roots = buildList {
                    rootInActiveWindow?.let { add(it) }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        try {
                            windows?.forEach { w ->
                                w.root?.let { r -> if (!contains(r)) add(r) }
                            }
                        } catch (_: Exception) {}
                    }
                }

                for (root in roots) {
                    val forceStopBtn = findForceStopButton(root, forceStopKeywords)
                    if (forceStopBtn != null) {
                        if (forceStopBtn.isEnabled) {
                            val clicked = forceStopBtn.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                            if (clicked) {
                                buttonClicked = true
                                log("  -> [Force Stop via Settings] Clicked 'Force Stop' button")
                                break
                            }
                        } else {
                            // Button is disabled, which means the app is already stopped!
                            log("  -> [Force Stop via Settings] App is already stopped (button disabled)")
                            buttonClicked = false
                            break
                        }
                    }
                }
            }

            // 3. Confirm the dialog ("OK" / "Confirmar" / button1) via Node inspection + Hardware Gesture Tap fallback
            if (buttonClicked) {
                delay(350)
                val dialogStartTime = System.currentTimeMillis()
                var dialogConfirmed = false

                while (System.currentTimeMillis() - dialogStartTime < 2000 && !dialogConfirmed) {
                    delay(80)
                    val dialogRoots = buildList {
                        rootInActiveWindow?.let { add(it) }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                            try {
                                windows?.forEach { w ->
                                    w.root?.let { r -> if (!contains(r)) add(r) }
                                }
                            } catch (_: Exception) {}
                        }
                    }

                    for (dialogRoot in dialogRoots) {
                        val confirmBtn = findConfirmDialogButton(dialogRoot)
                        if (confirmBtn != null) {
                            val rect = android.graphics.Rect()
                            confirmBtn.getBoundsInScreen(rect)
                            if (rect.width() > 0 && rect.height() > 0) {
                                performTap(rect.centerX().toFloat(), rect.centerY().toFloat())
                                log("  -> [Force Stop via Settings] Tapped OK button bounds at (${rect.centerX()}, ${rect.centerY()})")
                            }
                            confirmBtn.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                            dialogConfirmed = true
                            log("  -> [Force Stop via Settings] Confirmed Force Stop dialog (clicked OK)")
                            delay(300)
                            break
                        }
                    }
                }

                // If accessibility tree was blocked/obscured, fallback to hardware gesture tap on bottom-right OK
                if (!dialogConfirmed) {
                    val metrics = context.resources.displayMetrics
                    val w = metrics.widthPixels.toFloat()
                    val h = metrics.heightPixels.toFloat()
                    log("  -> [Force Stop via Settings] Dispatching hardware tap to bottom-right OK button (${(w * 0.73f).toInt()}, ${(h * 0.944f).toInt()})")
                    performTap(w * 0.73f, h * 0.944f)
                    delay(150)
                    performTap(w * 0.73f, h * 0.944f)
                    delay(300)
                }
            }

            // 4. Return immediately to Companion MainActivity
            val companionIntent = Intent(context, com.lucasdeeiroz.robotrunner.MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            context.startActivity(companionIntent)
            delay(200)
            return true
        } catch (e: Exception) {
            log("  -> [Force Stop via Settings] Failed: ${e.message}")
            return false
        }
    }

    private fun findForceStopButton(node: AccessibilityNodeInfo, keywords: List<String>): AccessibilityNodeInfo? {
        val text = node.text?.toString()?.lowercase() ?: ""
        val desc = node.contentDescription?.toString()?.lowercase() ?: ""
        val resId = node.viewIdResourceName?.lowercase() ?: ""

        val isMatch = keywords.any { kw ->
            text.contains(kw) || desc.contains(kw) || resId.contains(kw)
        }

        if (isMatch) {
            var cur: AccessibilityNodeInfo? = node
            while (cur != null) {
                if (cur.isClickable || cur.isEnabled) return cur
                cur = cur.parent
            }
            return node
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val match = findForceStopButton(child, keywords)
            if (match != null) return match
        }
        return null
    }

    private fun findConfirmDialogButton(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val text = node.text?.toString()?.trim()?.lowercase() ?: ""
        val desc = node.contentDescription?.toString()?.trim()?.lowercase() ?: ""
        val resId = node.viewIdResourceName?.lowercase() ?: ""
        val className = node.className?.toString() ?: ""

        // Exclude titles and messages to prevent false positive clicks
        val isTitleOrMessage = resId.contains("title") || resId.contains("message") || resId.contains("summary")

        if (!isTitleOrMessage) {
            val isButton1 = resId.endsWith(":id/button1") || resId == "android:id/button1"
            val isOkExact = text == "ok" || desc == "ok" || text == "confirmar" || desc == "confirmar" || text == "sim" || desc == "sim"

            if (isButton1 || (isOkExact && (node.isClickable || className.contains("Button")))) {
                return node
            }
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val match = findConfirmDialogButton(child)
            if (match != null) return match
        }
        return null
    }
}

data class CompanionEvent(
    val type: String,
    val packageName: String,
    val message: String,
    val timestamp: Long
)
