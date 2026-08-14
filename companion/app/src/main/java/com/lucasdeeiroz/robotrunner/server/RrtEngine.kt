package com.lucasdeeiroz.robotrunner.server

import android.content.Context
import android.content.Intent
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.lucasdeeiroz.robotrunner.service.CompanionAccessibilityService
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

object RrtEngine {
    private const val TAG = "RrtEngine"

    val logsFlow = MutableStateFlow<List<String>>(emptyList())
    val isRunningFlow = MutableStateFlow(false)
    val currentSuiteFlow = MutableStateFlow<String?>(null)
    val lastExitCodeFlow = MutableStateFlow<Int?>(null)

    fun clearLogs() {
        logsFlow.value = emptyList()
        lastExitCodeFlow.value = null
        currentSuiteFlow.value = null
    }

    fun executePayloadSync(context: Context, payload: JsonObject): JsonObject = runBlocking {
        val response = JsonObject()
        val logs = JsonArray()
        var overallSuccess = true
        var exitCode = 0

        isRunningFlow.value = true
        lastExitCodeFlow.value = null

        fun addLog(msg: String) {
            Log.i(TAG, msg)
            logs.add(msg)
            logsFlow.value = logsFlow.value + msg
        }

        try {
            val suiteName = payload.get("suite_name")?.asString ?: "RRT Suite"
            currentSuiteFlow.value = suiteName
            val targetPkg = payload.get("target_package")?.asString ?: ""
            addLog("[RRT] Starting execution of suite: $suiteName")
            if (targetPkg.isNotEmpty()) {
                addLog("[RRT] Target Application: $targetPkg")
            }

            val tests = payload.getAsJsonArray("tests")
            if (tests == null || tests.size() == 0) {
                addLog("[RRT] Warning: No tests found in payload.")
                response.addProperty("status", "ok")
                response.addProperty("exitCode", 0)
                response.add("logs", logs)
                return@runBlocking response
            }

            for (i in 0 until tests.size()) {
                val test = tests.get(i).asJsonObject
                val testName = test.get("name")?.asString ?: "Test #$i"
                addLog("----------------------------------------")
                addLog("[RRT] Running Test Case: $testName")

                // 1. Setup actions
                val setupActions = test.getAsJsonArray("setup")
                if (setupActions != null) {
                    for (k in 0 until setupActions.size()) {
                        val act = setupActions.get(k).asJsonObject
                        val ok = executeAction(context, act, ::addLog)
                        if (!ok) {
                            addLog("[RRT] Setup action failed: ${act.get("action")?.asString}")
                        }
                    }
                }

                // 2. Test steps
                val steps = test.getAsJsonArray("steps")
                if (steps != null) {
                    for (j in 0 until steps.size()) {
                        val step = steps.get(j).asJsonObject
                        val keyword = step.get("keyword")?.asString ?: "Step"
                        addLog("[Step] $keyword")

                        val actions = step.getAsJsonArray("actions")
                        if (actions != null && actions.size() > 0) {
                            for (k in 0 until actions.size()) {
                                val act = actions.get(k).asJsonObject
                                val ok = executeAction(context, act, ::addLog)
                                if (!ok) {
                                    addLog("[RRT] Action failed in step '$keyword'")
                                    overallSuccess = false
                                    exitCode = 1
                                    break
                                }
                            }
                        } else {
                            // Fallback if no decomposed actions
                            val rawArgs = step.getAsJsonArray("args")
                            val ok = executeKeywordFallback(context, keyword, rawArgs, ::addLog)
                            if (!ok) {
                                addLog("[RRT] Step '$keyword' failed.")
                                overallSuccess = false
                                exitCode = 1
                                break
                            }
                        }

                        if (!overallSuccess) break
                        delay(250)
                    }
                }

                // 3. Teardown actions
                val teardownActions = test.getAsJsonArray("teardown")
                if (teardownActions != null) {
                    for (k in 0 until teardownActions.size()) {
                        val act = teardownActions.get(k).asJsonObject
                        executeAction(context, act, ::addLog)
                    }
                }

                if (overallSuccess) {
                    addLog("[RRT] Test Passed: $testName")
                } else {
                    addLog("[RRT] Test Failed: $testName")
                }
            }

            addLog("----------------------------------------")
            addLog("[RRT] Suite execution finished with exit code: $exitCode")
        } catch (e: Exception) {
            Log.e(TAG, "Fatal error executing RRT payload", e)
            addLog("[RRT Error] ${e.message}")
            overallSuccess = false
            exitCode = 1
        } finally {
            isRunningFlow.value = false
            lastExitCodeFlow.value = exitCode
        }

        response.addProperty("status", if (overallSuccess) "ok" else "error")
        response.addProperty("exitCode", exitCode)
        response.add("logs", logs)
        response
    }

    private suspend fun executeAction(context: Context, actionObj: JsonObject, log: (String) -> Unit): Boolean {
        val actionType = actionObj.get("action")?.asString?.lowercase() ?: return true
        val service = CompanionAccessibilityService.instance

        when (actionType) {
            "launch_app" -> {
                val pkg = actionObj.get("package")?.asString ?: ""
                if (pkg.isNotEmpty()) {
                    log("  -> Launching Application: $pkg")
                    try {
                        val launchIntent = context.packageManager.getLaunchIntentForPackage(pkg)
                        if (launchIntent != null) {
                            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                            context.startActivity(launchIntent)
                            delay(2000)
                            return true
                        } else {
                            log("  -> Warning: No launch intent found for $pkg, attempting monkey launch")
                            Runtime.getRuntime().exec("monkey -p $pkg -c android.intent.category.LAUNCHER 1")
                            delay(2000)
                            return true
                        }
                    } catch (e: Exception) {
                        log("  -> Failed to launch app: ${e.message}")
                        return false
                    }
                }
                return true
            }

            "close_app" -> {
                val pkg = actionObj.get("package")?.asString ?: ""
                log("  -> Closing Application: $pkg")
                if (service != null) {
                    service.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_HOME)
                }
                delay(500)
                return true
            }

            "click" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                log("  -> Click: $rawTarget")
                if (service == null) {
                    log("  -> Error: Companion Accessibility Service is not active")
                    return false
                }
                return retryUntilTrue(timeoutSeconds = 5) {
                    performClickOnTarget(service, rawTarget)
                }
            }

            "wait_visible" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val timeout = actionObj.get("timeout")?.asInt ?: 15
                log("  -> Waiting for visibility of: $rawTarget (timeout: ${timeout}s)")
                if (service == null) return false
                return retryUntilTrue(timeoutSeconds = timeout) {
                    isTargetVisible(service, rawTarget)
                }
            }

            "assert_text" -> {
                val text = actionObj.get("text")?.asString ?: ""
                val timeout = actionObj.get("timeout")?.asInt ?: 15
                log("  -> Asserting text present on screen: '$text' (timeout: ${timeout}s)")
                if (service == null) return false
                val found = retryUntilTrue(timeoutSeconds = timeout) {
                    isTextPresentInHierarchy(service, text)
                }
                if (found) {
                    log("  -> Text '$text' verified successfully on UI tree.")
                } else {
                    log("  -> Verification failed: Text '$text' was not found on screen.")
                }
                return found
            }

            "input_text" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val text = actionObj.get("text")?.asString ?: ""
                log("  -> Input text: '$text' into '$rawTarget'")
                if (service == null) return false
                return retryUntilTrue(timeoutSeconds = 5) {
                    performInputOnTarget(service, rawTarget, text)
                }
            }

            "sleep" -> {
                val seconds = actionObj.get("seconds")?.asFloat ?: 1.0f
                log("  -> Sleep ${seconds}s")
                delay((seconds * 1000).toLong())
                return true
            }

            "press_key" -> {
                val keycode = actionObj.get("keycode")?.asInt ?: 4
                log("  -> Press keycode: $keycode")
                if (keycode == 4 && service != null) {
                    service.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK)
                }
                delay(300)
                return true
            }

            else -> {
                log("  -> Skipping unhandled action: $actionType")
                return true
            }
        }
    }

    private suspend fun executeKeywordFallback(context: Context, keyword: String, args: JsonArray?, log: (String) -> Unit): Boolean {
        val service = CompanionAccessibilityService.instance
        val low = keyword.lowercase()

        if (low.contains("clico") || low.contains("click") || low.contains("seleciono")) {
            if (args != null && args.size() > 0) {
                val target = args.get(0).asString
                log("  -> [Fallback Click] $target")
                if (service == null) return false
                return retryUntilTrue(5) { performClickOnTarget(service, target) }
            }
        } else if (low.contains("valida") || low.contains("assert") || low.contains("contém")) {
            if (args != null && args.size() > 0) {
                val text = args.get(0).asString
                log("  -> [Fallback Assert] $text")
                if (service == null) return false
                return retryUntilTrue(10) { isTextPresentInHierarchy(service, text) }
            }
        }
        return true
    }

    private fun parseLocator(raw: String): Triple<String?, String?, String?> {
        var resourceId: String? = null
        var textMatch: String? = null
        var descMatch: String? = null

        val unescaped = raw.replace("\\n", "\n").trim()

        if (unescaped.startsWith("accessibility_id=")) {
            descMatch = unescaped.removePrefix("accessibility_id=").trim()
            textMatch = descMatch
        } else if (unescaped.startsWith("id=")) {
            resourceId = unescaped.removePrefix("id=").trim()
        } else if (unescaped.startsWith("android=new UiSelector()")) {
            val descRegex = Regex("""description\("([^"]+)"\)""")
            val textRegex = Regex("""text\("([^"]+)"\)""")
            val idRegex = Regex("""resourceId\("([^"]+)"\)""")

            descRegex.find(unescaped)?.let { descMatch = it.groupValues[1] }
            textRegex.find(unescaped)?.let { textMatch = it.groupValues[1] }
            idRegex.find(unescaped)?.let { resourceId = it.groupValues[1] }
        } else if (unescaped.startsWith("xpath=")) {
            val contentDescRegex = Regex("""@content-desc=["']([^"']+)["']""")
            val textRegex = Regex("""@text=["']([^"']+)["']""")
            contentDescRegex.find(unescaped)?.let { descMatch = it.groupValues[1] }
            textRegex.find(unescaped)?.let { textMatch = it.groupValues[1] }
            if (descMatch == null && textMatch == null) {
                textMatch = unescaped.substringAfterLast("/").substringAfterLast("@")
            }
        } else {
            textMatch = unescaped
            descMatch = unescaped
        }

        return Triple(resourceId, textMatch, descMatch)
    }

    private fun performClickOnTarget(service: CompanionAccessibilityService, rawTarget: String): Boolean {
        val (resId, text, desc) = parseLocator(rawTarget)
        return service.performNodeActionByMatch(
            resourceId = resId,
            textMatch = text,
            contentDescMatch = desc,
            action = "click"
        )
    }

    private fun performInputOnTarget(service: CompanionAccessibilityService, rawTarget: String, textValue: String): Boolean {
        val (resId, text, desc) = parseLocator(rawTarget)
        return service.performNodeActionByMatch(
            resourceId = resId,
            textMatch = text,
            contentDescMatch = desc,
            action = "input",
            textValue = textValue
        )
    }

    private fun isTargetVisible(service: CompanionAccessibilityService, rawTarget: String): Boolean {
        val (resId, text, desc) = parseLocator(rawTarget)
        val root = service.rootInActiveWindow ?: return false
        return findNodeByCriteria(root, resId, text, desc) != null
    }

    private fun isTextPresentInHierarchy(service: CompanionAccessibilityService, text: String): Boolean {
        val root = service.rootInActiveWindow ?: return false
        return findTextInNode(root, text)
    }

    private fun findTextInNode(node: AccessibilityNodeInfo, text: String): Boolean {
        val nodeText = node.text?.toString() ?: ""
        val nodeDesc = node.contentDescription?.toString() ?: ""
        if (nodeText.contains(text, ignoreCase = true) || nodeDesc.contains(text, ignoreCase = true)) {
            return true
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            if (findTextInNode(child, text)) return true
        }
        return false
    }

    private fun findNodeByCriteria(node: AccessibilityNodeInfo, resId: String?, text: String?, desc: String?): AccessibilityNodeInfo? {
        if (!resId.isNullOrEmpty() && node.viewIdResourceName?.equals(resId, ignoreCase = true) == true) return node
        if (!text.isNullOrEmpty() && node.text?.toString()?.contains(text, ignoreCase = true) == true) return node
        if (!desc.isNullOrEmpty() && node.contentDescription?.toString()?.contains(desc, ignoreCase = true) == true) return node

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val match = findNodeByCriteria(child, resId, text, desc)
            if (match != null) return match
        }
        return null
    }

    private suspend fun retryUntilTrue(timeoutSeconds: Int, intervalMs: Long = 200, block: () -> Boolean): Boolean {
        val maxAttempts = ((timeoutSeconds * 1000) / intervalMs).toInt().coerceAtLeast(1)
        for (attempt in 0 until maxAttempts) {
            if (block()) return true
            delay(intervalMs)
        }
        return false
    }
}
