package com.lucasdeeiroz.robotrunner.server

import android.content.Context
import android.content.Intent
import android.os.Environment
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.lucasdeeiroz.robotrunner.service.CompanionAccessibilityService
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class RrtStep(
    val keyword: String,
    val args: List<String> = emptyList(),
    val actions: List<JsonObject> = emptyList(),
    var status: String = "PENDING", // PENDING, RUNNING, PASSED, FAILED, SKIPPED
    var durationMs: Long = 0,
    var errorMessage: String? = null
)

data class RrtTestCase(
    val name: String,
    val setup: List<JsonObject> = emptyList(),
    val steps: List<RrtStep> = emptyList(),
    val teardown: List<JsonObject> = emptyList(),
    var status: String = "NOT_STARTED", // NOT_STARTED, RUNNING, PASSED, FAILED
    var durationMs: Long = 0
)

data class RrtExecutionReport(
    val reportId: String,
    val suiteName: String,
    val targetPackage: String,
    val startTime: Long,
    val endTime: Long,
    val totalScenarios: Int,
    val passedScenarios: Int,
    val failedScenarios: Int,
    val testCases: List<RrtTestCase>,
    val logs: List<String>
)

data class RrtSavedSuite(
    val id: String,
    val name: String,
    val targetPackage: String,
    val testCases: List<RrtTestCase>,
    val rawJson: JsonObject,
    val filePath: String,
    val lastModified: Long,
    var lastReport: RrtExecutionReport? = null
)

object RrtEngine {
    private const val TAG = "RrtEngine"
    private val gson: Gson = GsonBuilder().setPrettyPrinting().create()

    val logsFlow = MutableStateFlow<List<String>>(emptyList())
    val isRunningFlow = MutableStateFlow(false)
    val currentSuiteFlow = MutableStateFlow<String?>(null)
    val lastExitCodeFlow = MutableStateFlow<Int?>(null)
    val savedSuitesFlow = MutableStateFlow<List<RrtSavedSuite>>(emptyList())

    private var executionJob: Job? = null

    fun clearLogs() {
        logsFlow.value = emptyList()
        lastExitCodeFlow.value = null
        currentSuiteFlow.value = null
    }

    fun saveSuiteReport(context: Context, suiteName: String, report: RrtExecutionReport) {
        try {
            val safeName = suiteName.replace("[^a-zA-Z0-9_\\-]".toRegex(), "_")
            val internalDir = File(context.filesDir, "rrt_suites")
            if (!internalDir.exists()) internalDir.mkdirs()

            val file = File(internalDir, "report_${safeName}.json")
            FileOutputStream(file).use { out ->
                out.write(gson.toJson(report).toByteArray())
            }
            Log.i(TAG, "Saved last execution report for suite '$suiteName' to: ${file.absolutePath}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save execution report for '$suiteName'", e)
        }
    }

    fun loadSuiteReport(context: Context, suiteName: String): RrtExecutionReport? {
        return try {
            val safeName = suiteName.replace("[^a-zA-Z0-9_\\-]".toRegex(), "_")
            val internalDir = File(context.filesDir, "rrt_suites")
            val file = File(internalDir, "report_${safeName}.json")
            if (file.exists()) {
                val jsonStr = file.readText()
                gson.fromJson(jsonStr, RrtExecutionReport::class.java)
            } else {
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Could not load report for '$suiteName': ${e.message}")
            null
        }
    }

    fun parseSuiteFromJson(
        payload: JsonObject,
        filePath: String = "",
        lastModified: Long = System.currentTimeMillis(),
        context: Context? = null
    ): RrtSavedSuite {
        val suiteName = payload.get("suite_name")?.asString ?: "RRT Suite"
        val targetPkg = payload.get("target_package")?.asString ?: ""
        val testsJson = payload.getAsJsonArray("tests")

        val testCases = mutableListOf<RrtTestCase>()
        if (testsJson != null) {
            for (i in 0 until testsJson.size()) {
                val tObj = testsJson.get(i).asJsonObject
                val tName = tObj.get("name")?.asString ?: "Test #$i"

                val setupActions = mutableListOf<JsonObject>()
                tObj.getAsJsonArray("setup")?.forEach { setupActions.add(it.asJsonObject) }

                val teardownActions = mutableListOf<JsonObject>()
                tObj.getAsJsonArray("teardown")?.forEach { teardownActions.add(it.asJsonObject) }

                val steps = mutableListOf<RrtStep>()
                tObj.getAsJsonArray("steps")?.forEach { sElem ->
                    val sObj = sElem.asJsonObject
                    val keyword = sObj.get("keyword")?.asString ?: "Step"
                    val args = mutableListOf<String>()
                    sObj.getAsJsonArray("args")?.forEach { args.add(it.asString) }
                    val actions = mutableListOf<JsonObject>()
                    sObj.getAsJsonArray("actions")?.forEach { actions.add(it.asJsonObject) }
                    steps.add(RrtStep(keyword = keyword, args = args, actions = actions))
                }

                testCases.add(
                    RrtTestCase(
                        name = tName,
                        setup = setupActions,
                        steps = steps,
                        teardown = teardownActions
                    )
                )
            }
        }

        val report = if (context != null) loadSuiteReport(context, suiteName) else null
        if (report != null) {
            for (repTest in report.testCases) {
                val match = testCases.find { it.name == repTest.name }
                if (match != null) {
                    match.status = repTest.status
                    match.durationMs = repTest.durationMs
                    for (idx in match.steps.indices) {
                        if (idx < repTest.steps.size) {
                            val repStep = repTest.steps[idx]
                            match.steps[idx].status = repStep.status
                            match.steps[idx].durationMs = repStep.durationMs
                            match.steps[idx].errorMessage = repStep.errorMessage
                        }
                    }
                }
            }
        }

        val id = "suite_${suiteName.replace("[^a-zA-Z0-9_\\-]".toRegex(), "_")}"
        return RrtSavedSuite(
            id = id,
            name = suiteName,
            targetPackage = targetPkg,
            testCases = testCases,
            rawJson = payload,
            filePath = filePath,
            lastModified = lastModified,
            lastReport = report
        )
    }

    fun getSampleSuite(): RrtSavedSuite {
        val sampleJson = JsonObject().apply {
            addProperty("suite_name", "Sanity Login & Account Verification")
            addProperty("target_package", "com.positivo.casainteligente")
            val tests = JsonArray().apply {
                val test1 = JsonObject().apply {
                    addProperty("name", "Validando Login e Acesso ao App")
                    val steps = JsonArray().apply {
                        add(JsonObject().apply {
                            addProperty("keyword", "Dado que inicio o aplicativo")
                            add("args", JsonArray().apply { add("com.positivo.casainteligente") })
                            add("actions", JsonArray().apply {
                                add(JsonObject().apply {
                                    addProperty("action", "launch_app")
                                    addProperty("package", "com.positivo.casainteligente")
                                })
                            })
                        })
                        add(JsonObject().apply {
                            addProperty("keyword", "Quando aguardo o carregamento da tela")
                            add("actions", JsonArray().apply {
                                add(JsonObject().apply {
                                    addProperty("action", "sleep")
                                    addProperty("seconds", 2.0f)
                                })
                            })
                        })
                        add(JsonObject().apply {
                            addProperty("keyword", "Entao verifico a tela principal")
                            add("actions", JsonArray().apply {
                                add(JsonObject().apply {
                                    addProperty("action", "assert_text")
                                    addProperty("text", "Entrar")
                                    addProperty("timeout", 5)
                                })
                            })
                        })
                    }
                    add("steps", steps)
                }
                add(test1)
            }
            add("tests", tests)
        }
        return parseSuiteFromJson(sampleJson, "", System.currentTimeMillis(), null)
    }

    fun saveSuitePayload(context: Context, payload: JsonObject): RrtSavedSuite? {
        return try {
            val suiteName = payload.get("suite_name")?.asString ?: "RRT_Suite_${System.currentTimeMillis()}"
            val safeName = suiteName.replace("[^a-zA-Z0-9_\\-]".toRegex(), "_")

            val internalDir = File(context.filesDir, "rrt_suites")
            if (!internalDir.exists()) internalDir.mkdirs()

            val file = File(internalDir, "suite_${safeName}.json")
            FileOutputStream(file).use { out ->
                out.write(gson.toJson(payload).toByteArray())
            }
            Log.i(TAG, "Saved RRT suite internally: ${file.absolutePath}")

            try {
                val dlDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                if (dlDir.exists() && dlDir.canWrite()) {
                    val dlFile = File(dlDir, "suite_${safeName}.json")
                    FileOutputStream(dlFile).use { out ->
                        out.write(gson.toJson(payload).toByteArray())
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Could not copy suite to Downloads: ${e.message}")
            }

            val saved = parseSuiteFromJson(payload, file.absolutePath, file.lastModified(), context)
            reloadSavedSuites(context)
            saved
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save RRT suite", e)
            null
        }
    }

    fun listSavedSuites(context: Context): List<RrtSavedSuite> {
        val list = mutableListOf<RrtSavedSuite>()
        val seenNames = mutableSetOf<String>()

        // 1. Check internal storage
        val internalDir = File(context.filesDir, "rrt_suites")
        if (internalDir.exists() && internalDir.isDirectory) {
            internalDir.listFiles()?.forEach { file ->
                if (file.name.startsWith("suite_") && file.name.endsWith(".json")) {
                    try {
                        val content = file.readText()
                        val json = gson.fromJson(content, JsonObject::class.java)
                        val suite = parseSuiteFromJson(json, file.absolutePath, file.lastModified(), context)
                        if (seenNames.add(suite.name)) {
                            list.add(suite)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing saved suite from ${file.name}", e)
                    }
                }
            }
        }

        // 2. Check Downloads directory
        try {
            val dlDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (dlDir.exists() && dlDir.isDirectory) {
                dlDir.listFiles()?.forEach { file ->
                    if (file.name.startsWith("suite_") && file.name.endsWith(".json")) {
                        try {
                            val content = file.readText()
                            val json = gson.fromJson(content, JsonObject::class.java)
                            val suite = parseSuiteFromJson(json, file.absolutePath, file.lastModified(), context)
                            if (seenNames.add(suite.name)) {
                                list.add(suite)
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error parsing suite from Downloads: ${file.name}", e)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error scanning Downloads directory: ${e.message}")
        }

        // 3. Fallback to sample suite if empty
        if (list.isEmpty()) {
            val sample = getSampleSuite()
            sample.lastReport = loadSuiteReport(context, sample.name)
            list.add(sample)
        }

        return list.sortedByDescending { it.lastModified }
    }

    fun reloadSavedSuites(context: Context) {
        savedSuitesFlow.value = listSavedSuites(context)
    }

    fun deleteSavedSuite(context: Context, suite: RrtSavedSuite): Boolean {
        var deleted = false
        val safeName = suite.name.replace("[^a-zA-Z0-9_\\-]".toRegex(), "_")

        if (suite.filePath.isNotEmpty()) {
            val file = File(suite.filePath)
            if (file.exists()) {
                deleted = file.delete()
            }
        }

        // Also check filesDir / rrt_suites
        val internalDir = File(context.filesDir, "rrt_suites")
        val internalFile = File(internalDir, "suite_${safeName}.json")
        if (internalFile.exists()) {
            internalFile.delete()
            deleted = true
        }

        // Also delete report file
        val reportFile = File(internalDir, "report_${safeName}.json")
        if (reportFile.exists()) {
            reportFile.delete()
        }

        // Also check Downloads
        try {
            val dlFile = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "suite_${safeName}.json")
            if (dlFile.exists()) {
                dlFile.delete()
                deleted = true
            }
        } catch (_: Exception) {}

        reloadSavedSuites(context)
        return deleted
    }

    fun stopExecution() {
        isRunningFlow.value = false
        executionJob?.cancel()
        executionJob = null
    }

    suspend fun executeSavedSuite(
        context: Context,
        suite: RrtSavedSuite,
        onStepUpdated: () -> Unit = {}
    ): RrtExecutionReport = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        val logs = mutableListOf<String>()
        var passedCount = 0
        var failedCount = 0
        var overallExitCode = 0

        isRunningFlow.value = true
        lastExitCodeFlow.value = null
        currentSuiteFlow.value = suite.name
        val totalSteps = suite.testCases.sumOf { it.steps.size }
        var currentStepNumber = 0

        fun addLog(msg: String) {
            Log.i(TAG, msg)
            logs.add(msg)
            logsFlow.value = logsFlow.value + msg
        }

        RrtNotificationManager.showProgress(context, suite.name, 0, totalSteps, "Iniciando...")
        addLog("[RRT] Starting execution of suite: ${suite.name}")
        if (suite.targetPackage.isNotEmpty()) {
            addLog("[RRT] Target Application: ${suite.targetPackage}")
        }

        try {
            for (test in suite.testCases) {
                if (!isRunningFlow.value) {
                    test.status = "NOT_STARTED"
                    break
                }

                test.status = "RUNNING"
                val testStart = System.currentTimeMillis()
                var testPassed = true
                addLog("----------------------------------------")
                addLog("[RRT] Running Test Case: ${test.name}")
                onStepUpdated()

                val runtimeVars = mutableMapOf<String, Any>()
                suite.rawJson.getAsJsonObject("variables")?.entrySet()?.forEach { (k, v) ->
                    val cleanK = cleanAssignName(k)
                    runtimeVars[cleanK] = v.asString
                }

                // Setup actions
                for (act in test.setup) {
                    if (!isRunningFlow.value) break
                    val status = executeAction(context, act, ::addLog, isDesktopExecution = false, runtimeVars = runtimeVars)
                    if (status == ActionStatus.FAILED) {
                        addLog("[RRT] Setup action failed: ${act.get("action")?.asString}")
                    }
                }

                // Steps
                for (step in test.steps) {
                    if (!isRunningFlow.value) {
                        step.status = "SKIPPED"
                        onStepUpdated()
                        continue
                    }

                    step.status = "RUNNING"
                    val stepStart = System.currentTimeMillis()
                    currentStepNumber++
                    RrtNotificationManager.showProgress(context, suite.name, currentStepNumber, totalSteps, step.keyword)
                    addLog("[Step] ${step.keyword}")
                    onStepUpdated()

                    var stepPassed = true
                    if (step.actions.isNotEmpty()) {
                        for (act in step.actions) {
                            if (!isRunningFlow.value) break
                            val status = executeAction(context, act, ::addLog, isDesktopExecution = false, runtimeVars = runtimeVars)
                            if (status == ActionStatus.FAILED) {
                                addLog("[RRT] Action failed in step '${step.keyword}'")
                                stepPassed = false
                                break
                            }
                        }
                    } else {
                        val rawArgs = JsonArray().apply { step.args.forEach { add(it) } }
                        val ok = executeKeywordFallback(context, step.keyword, rawArgs, ::addLog)
                        if (!ok) {
                            addLog("[RRT] Step '${step.keyword}' failed.")
                            stepPassed = false
                        }
                    }

                    step.durationMs = System.currentTimeMillis() - stepStart
                    if (stepPassed) {
                        step.status = "PASSED"
                    } else {
                        step.status = "FAILED"
                        testPassed = false
                        overallExitCode = 1
                    }
                    onStepUpdated()

                    if (!stepPassed) break
                    delay(250)
                }

                // Teardown actions
                for (act in test.teardown) {
                    executeAction(context, act, ::addLog, isDesktopExecution = false, runtimeVars = runtimeVars)
                }

                test.durationMs = System.currentTimeMillis() - testStart
                if (testPassed) {
                    test.status = "PASSED"
                    passedCount++
                    addLog("[RRT] Test Passed: ${test.name}")
                } else {
                    test.status = "FAILED"
                    failedCount++
                    addLog("[RRT] Test Failed: ${test.name}")
                }
                onStepUpdated()
            }

            addLog("----------------------------------------")
            addLog("[RRT] Suite execution finished with exit code: $overallExitCode")
        } catch (e: Exception) {
            Log.e(TAG, "Error during RRT suite execution", e)
            addLog("[RRT Error] ${e.message}")
            overallExitCode = 1
        } finally {
            isRunningFlow.value = false
            lastExitCodeFlow.value = overallExitCode
            RrtNotificationManager.showCompletion(context, suite.name, overallExitCode == 0, passedCount, suite.testCases.size)
        }

        val report = RrtExecutionReport(
            reportId = "rep_${startTime}",
            suiteName = suite.name,
            targetPackage = suite.targetPackage,
            startTime = startTime,
            endTime = System.currentTimeMillis(),
            totalScenarios = suite.testCases.size,
            passedScenarios = passedCount,
            failedScenarios = failedCount,
            testCases = suite.testCases,
            logs = logs
        )

        // Save report to disk and update suite
        saveSuiteReport(context, suite.name, report)
        suite.lastReport = report

        report
    }

    suspend fun executePayloadStreaming(
        context: Context,
        payload: JsonObject,
        onEvent: (JsonObject) -> Unit
    ) = withContext(Dispatchers.IO) {
        val savedSuite = try {
            saveSuitePayload(context, payload)
        } catch (e: Exception) {
            Log.w(TAG, "Failed auto-saving incoming RRT payload", e)
            null
        }

        val logs = JsonArray()
        val logsList = mutableListOf<String>()
        var overallSuccess = true
        var exitCode = 0
        val startTime = System.currentTimeMillis()
        val testCasesRan = savedSuite?.testCases ?: mutableListOf()
        var passedCount = 0
        var failedCount = 0

        isRunningFlow.value = true
        lastExitCodeFlow.value = null

        fun addLog(msg: String) {
            Log.i(TAG, msg)
            logs.add(msg)
            logsList.add(msg)
            logsFlow.value = logsFlow.value + msg

            val event = JsonObject().apply {
                addProperty("type", "log")
                addProperty("message", msg)
            }
            onEvent(event)
        }

        val suiteName = payload.get("suite_name")?.asString ?: "RRT Suite"
        val targetPkg = payload.get("target_package")?.asString ?: ""

        val tests = payload.getAsJsonArray("tests")
        var totalSteps = 0
        if (tests != null) {
            for (i in 0 until tests.size()) {
                val t = tests.get(i).asJsonObject
                totalSteps += t.getAsJsonArray("steps")?.size() ?: 0
            }
        }
        var currentStepNumber = 0

        RrtNotificationManager.showProgress(context, suiteName, 0, totalSteps, "Iniciando...")

        try {
            currentSuiteFlow.value = suiteName
            addLog("[RRT] Starting execution of suite: $suiteName")
            if (targetPkg.isNotEmpty()) {
                addLog("[RRT] Target Application: $targetPkg")
            }

            if (tests == null || tests.size() == 0) {
                addLog("[RRT] Warning: No tests found in payload.")
                val finishEvt = JsonObject().apply {
                    addProperty("type", "finish")
                    addProperty("status", "ok")
                    addProperty("exitCode", 0)
                    add("logs", logs)
                }
                onEvent(finishEvt)
                return@withContext
            }

            for (i in 0 until tests.size()) {
                val test = tests.get(i).asJsonObject
                val testName = test.get("name")?.asString ?: "Test #$i"
                val matchTestCase = testCasesRan.getOrNull(i)
                matchTestCase?.status = "RUNNING"
                val testStart = System.currentTimeMillis()
                var testPassed = true

                addLog("----------------------------------------")
                addLog("[RRT] Running Test Case: $testName")

                val runtimeVars = mutableMapOf<String, Any>()
                payload.getAsJsonObject("variables")?.entrySet()?.forEach { (k, v) ->
                    val cleanK = cleanAssignName(k)
                    runtimeVars[cleanK] = v.asString
                }

                // 1. Setup actions
                val setupActions = test.getAsJsonArray("setup")
                if (setupActions != null) {
                    for (k in 0 until setupActions.size()) {
                        val act = setupActions.get(k).asJsonObject
                        val status = executeAction(context, act, ::addLog, isDesktopExecution = true, runtimeVars = runtimeVars)
                        if (status == ActionStatus.FAILED) {
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
                        val matchStep = matchTestCase?.steps?.getOrNull(j)
                        matchStep?.status = "RUNNING"
                        val stepStart = System.currentTimeMillis()

                        currentStepNumber++
                        RrtNotificationManager.showProgress(context, suiteName, currentStepNumber, totalSteps, keyword)
                        addLog("[Step] $keyword")

                        val stepEvt = JsonObject().apply {
                            addProperty("type", "step")
                            addProperty("step", keyword)
                            addProperty("status", "RUNNING")
                        }
                        onEvent(stepEvt)

                        var stepPassed = true
                        val actions = step.getAsJsonArray("actions")
                        if (actions != null && actions.size() > 0) {
                            for (k in 0 until actions.size()) {
                                val act = actions.get(k).asJsonObject
                                val status = executeAction(context, act, ::addLog, isDesktopExecution = true, runtimeVars = runtimeVars)
                                if (status == ActionStatus.FAILED) {
                                    addLog("[RRT] Action failed in step '$keyword'")
                                    overallSuccess = false
                                    testPassed = false
                                    stepPassed = false
                                    exitCode = 1
                                    break
                                }
                            }
                        } else {
                            val rawArgs = step.getAsJsonArray("args")
                            val ok = executeKeywordFallback(context, keyword, rawArgs, ::addLog, isDesktopExecution = true)
                            if (!ok) {
                                addLog("[RRT] Step '$keyword' failed.")
                                overallSuccess = false
                                testPassed = false
                                stepPassed = false
                                exitCode = 1
                            }
                        }

                        matchStep?.durationMs = System.currentTimeMillis() - stepStart
                        matchStep?.status = if (stepPassed) "PASSED" else "FAILED"

                        if (!stepPassed) break
                        delay(250)
                    }
                }

                // 3. Teardown actions
                val teardownActions = test.getAsJsonArray("teardown")
                if (teardownActions != null) {
                    for (k in 0 until teardownActions.size()) {
                        val act = teardownActions.get(k).asJsonObject
                        executeAction(context, act, ::addLog, isDesktopExecution = true, runtimeVars = runtimeVars)
                    }
                }

                matchTestCase?.durationMs = System.currentTimeMillis() - testStart
                if (testPassed) {
                    matchTestCase?.status = "PASSED"
                    passedCount++
                    addLog("[RRT] Test Passed: $testName")
                } else {
                    matchTestCase?.status = "FAILED"
                    failedCount++
                    addLog("[RRT] Test Failed: $testName")
                }
            }

            addLog("----------------------------------------")
            addLog("[RRT] Suite execution finished with exit code: $exitCode")

            // Bring Companion to front to display updated results without opening Settings
            try {
                val companionIntent = Intent(context, com.lucasdeeiroz.robotrunner.MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                }
                context.startActivity(companionIntent)
            } catch (_: Exception) {}
        } catch (e: Exception) {
            Log.e(TAG, "Fatal error executing RRT payload", e)
            addLog("[RRT Error] ${e.message}")
            overallSuccess = false
            exitCode = 1
        } finally {
            isRunningFlow.value = false
            lastExitCodeFlow.value = exitCode
            RrtNotificationManager.showCompletion(context, suiteName, overallSuccess, passedCount, tests?.size() ?: 0)

            val finishEvt = JsonObject().apply {
                addProperty("type", "finish")
                addProperty("status", if (overallSuccess) "ok" else "error")
                addProperty("exitCode", exitCode)
                add("logs", logs)
            }
            onEvent(finishEvt)
        }

        val report = RrtExecutionReport(
            reportId = "rep_${startTime}",
            suiteName = suiteName,
            targetPackage = targetPkg,
            startTime = startTime,
            endTime = System.currentTimeMillis(),
            totalScenarios = testCasesRan.size,
            passedScenarios = passedCount,
            failedScenarios = failedCount,
            testCases = testCasesRan,
            logs = logsList
        )

        // Save report to disk and update suite
        saveSuiteReport(context, suiteName, report)
        savedSuite?.lastReport = report
    }

    fun executePayloadSync(context: Context, payload: JsonObject): JsonObject = runBlocking {
        var finalRes = JsonObject()
        executePayloadStreaming(context, payload) { evt ->
            if (evt.get("type")?.asString == "finish") {
                finalRes = evt
            }
        }
        finalRes
    }

    fun exportReportHtml(context: Context, report: RrtExecutionReport): File? {
        return try {
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val safeName = report.suiteName.replace("[^a-zA-Z0-9_\\-]".toRegex(), "_")
            val fileName = "report_rrt_${safeName}_${System.currentTimeMillis()}.html"
            val file = File(downloadsDir, fileName)

            val df = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
            val startStr = df.format(Date(report.startTime))
            val endStr = df.format(Date(report.endTime))
            val passRate = if (report.totalScenarios > 0) (report.passedScenarios * 100) / report.totalScenarios else 0

            val html = buildString {
                append("<!DOCTYPE html>\n<html><head><meta charset='UTF-8'><title>RRT Audit Report - ${report.suiteName}</title>")
                append("<style>")
                append("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 24px; }")
                append(".container { max-width: 900px; margin: 0 auto; }")
                append(".header { background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #334155; margin-bottom: 20px; }")
                append(".badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; }")
                append(".pass { background: #22c55e22; color: #4ade80; border: 1px solid #22c55e44; }")
                append(".fail { background: #ef444422; color: #f87171; border: 1px solid #ef444444; }")
                append(".card { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 16px; margin-bottom: 12px; }")
                append(".step-row { font-family: monospace; font-size: 12px; padding: 4px 0; }")
                append(".log-box { background: #090d16; border: 1px solid #1e293b; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; max-height: 300px; overflow-y: auto; color: #94a3b8; }")
                append("</style></head><body><div class='container'>")
                append("<div class='header'>")
                append("<h2>Robot Runner - RRT Execution Report</h2>")
                append("<p><strong>Suite:</strong> ${report.suiteName} | <strong>Target:</strong> ${report.targetPackage}</p>")
                append("<p><strong>Period:</strong> $startStr &mdash; $endStr</p>")
                append("<p><span class='badge ${if (passRate == 100) "pass" else "fail"}'>$passRate% PASS RATE (${report.passedScenarios}/${report.totalScenarios})</span></p>")
                append("</div>")

                append("<h3>Test Scenarios</h3>")
                for (test in report.testCases) {
                    val statusClass = if (test.status == "PASSED") "pass" else "fail"
                    append("<div class='card'>")
                    append("<div style='display:flex; justify-content:space-between; align-items:center;'>")
                    append("<h4>${test.name}</h4>")
                    append("<span class='badge $statusClass'>${test.status} (${test.durationMs}ms)</span>")
                    append("</div>")

                    for (step in test.steps) {
                        val stepClass = if (step.status == "PASSED") "pass" else "fail"
                        append("<div class='step-row'>")
                        append("<span class='badge $stepClass' style='padding: 2px 6px; font-size: 10px;'>${step.status.take(4)}</span> ")
                        append("<span style='color: #c084fc; font-weight: bold;'>${step.keyword}</span> ")
                        append("<span style='color: #cbd5e1;'>${step.args.joinToString(" ")}</span>")
                        append("</div>")
                    }
                    append("</div>")
                }

                append("<h3>Execution Console Stream</h3>")
                append("<div class='log-box'>")
                for (line in report.logs) {
                    append("<div>${line.replace("<", "&lt;").replace(">", "&gt;")}</div>")
                }
                append("</div>")

                append("</div></body></html>")
            }

            FileOutputStream(file).use { out ->
                out.write(html.toByteArray())
            }
            Log.i(TAG, "Exported HTML report: ${file.absolutePath}")
            file
        } catch (e: Exception) {
            Log.e(TAG, "Failed exporting HTML report", e)
            null
        }
    }

    enum class ActionStatus {
        SUCCESS,
        FAILED,
        BREAK,
        CONTINUE
    }

    private fun cleanAssignName(raw: String): String {
        return raw.replace("\${", "").replace("}", "").replace("=", "").replace("@{", "").replace("&{", "").trim()
    }

    private fun resolveRuntimeVariables(text: String, runtimeVars: Map<String, Any>): String {
        var result = text
        for (iter in 0..2) {
            val prev = result
            // 1. Resolve ${var}[property] e.g. ${posicoes}[height]
            val propRegex = Regex("""\$\{([a-zA-Z0-9_]+)\}\[([a-zA-Z0-9_]+)\]""")
            result = propRegex.replace(result) { match ->
                val varName = match.groupValues[1]
                val prop = match.groupValues[2]
                val varVal = runtimeVars[varName]
                when (varVal) {
                    is Map<*, *> -> varVal[prop]?.toString() ?: "0"
                    is JsonObject -> varVal.get(prop)?.asString ?: "0"
                    else -> "0"
                }
            }
            // 2. Resolve ${var} e.g. ${linha_x}
            val varRegex = Regex("""\$\{([a-zA-Z0-9_]+)\}""")
            result = varRegex.replace(result) { match ->
                val varName = match.groupValues[1]
                val varVal = runtimeVars[varName]
                if (varVal != null) varVal.toString() else match.value
            }
            if (result == prev) break
        }
        return result
    }

    private fun evalMathExpression(expr: String): Double {
        val clean = expr.replace("//", "/").replace(" ", "")
        return try {
            object : Any() {
                var pos = -1
                var ch = 0

                fun nextChar() {
                    ch = if (++pos < clean.length) clean[pos].code else -1
                }

                fun eat(charToEat: Int): Boolean {
                    while (ch == ' '.code) nextChar()
                    if (ch == charToEat) {
                        nextChar()
                        return true
                    }
                    return false
                }

                fun parse(): Double {
                    nextChar()
                    val x = parseExpression()
                    return x
                }

                fun parseExpression(): Double {
                    var x = parseTerm()
                    while (true) {
                        when {
                            eat('+'.code) -> x += parseTerm()
                            eat('-'.code) -> x -= parseTerm()
                            else -> return x
                        }
                    }
                }

                fun parseTerm(): Double {
                    var x = parseFactor()
                    while (true) {
                        when {
                            eat('*'.code) -> x *= parseFactor()
                            eat('/'.code) -> {
                                val divisor = parseFactor()
                                x = if (divisor != 0.0) x / divisor else 0.0
                            }
                            eat('%'.code) -> {
                                val divisor = parseFactor()
                                x = if (divisor != 0.0) x % divisor else 0.0
                            }
                            else -> return x
                        }
                    }
                }

                fun parseFactor(): Double {
                    if (eat('+'.code)) return +parseFactor()
                    if (eat('-'.code)) return -parseFactor()

                    var x: Double
                    val startPos = pos
                    if (eat('('.code)) {
                        x = parseExpression()
                        eat(')'.code)
                    } else if ((ch >= '0'.code && ch <= '9'.code) || ch == '.'.code) {
                        while ((ch >= '0'.code && ch <= '9'.code) || ch == '.'.code) nextChar()
                        x = clean.substring(startPos, pos).toDoubleOrNull() ?: 0.0
                    } else {
                        x = 0.0
                    }
                    return x
                }
            }.parse()
        } catch (e: Exception) {
            0.0
        }
    }

    private fun evalCondition(condStr: String): Boolean {
        val trimmed = condStr.trim()
        if (trimmed.equals("true", ignoreCase = true) || trimmed == "1") return true
        if (trimmed.equals("false", ignoreCase = true) || trimmed == "0") return false

        // Check operators: ==, !=, <=, >=, <, >
        if (trimmed.contains("==")) {
            val parts = trimmed.split("==", limit = 2)
            val left = parts[0].trim().removeSurrounding("\"", "'")
            val right = parts[1].trim().removeSurrounding("\"", "'")
            if (left.equals("true", ignoreCase = true) || left.equals("false", ignoreCase = true)) {
                return left.equals(right, ignoreCase = true)
            }
            val numL = left.toDoubleOrNull()
            val numR = right.toDoubleOrNull()
            return if (numL != null && numR != null) numL == numR else left == right
        }
        if (trimmed.contains("!=")) {
            val parts = trimmed.split("!=", limit = 2)
            val left = parts[0].trim().removeSurrounding("\"", "'")
            val right = parts[1].trim().removeSurrounding("\"", "'")
            if (left.equals("true", ignoreCase = true) || left.equals("false", ignoreCase = true)) {
                return !left.equals(right, ignoreCase = true)
            }
            val numL = left.toDoubleOrNull()
            val numR = right.toDoubleOrNull()
            return if (numL != null && numR != null) numL != numR else left != right
        }
        if (trimmed.contains("<=")) {
            val parts = trimmed.split("<=", limit = 2)
            val numL = parts[0].trim().toDoubleOrNull() ?: 0.0
            val numR = parts[1].trim().toDoubleOrNull() ?: 0.0
            return numL <= numR
        }
        if (trimmed.contains(">=")) {
            val parts = trimmed.split(">=", limit = 2)
            val numL = parts[0].trim().toDoubleOrNull() ?: 0.0
            val numR = parts[1].trim().toDoubleOrNull() ?: 0.0
            return numL >= numR
        }
        if (trimmed.contains("<")) {
            val parts = trimmed.split("<", limit = 2)
            val numL = parts[0].trim().toDoubleOrNull() ?: 0.0
            val numR = parts[1].trim().toDoubleOrNull() ?: 0.0
            return numL < numR
        }
        if (trimmed.contains(">")) {
            val parts = trimmed.split(">", limit = 2)
            val numL = parts[0].trim().toDoubleOrNull() ?: 0.0
            val numR = parts[1].trim().toDoubleOrNull() ?: 0.0
            return numL > numR
        }
        return false
    }

    private suspend fun executeAction(
        context: Context,
        actionObj: JsonObject,
        log: (String) -> Unit,
        isDesktopExecution: Boolean = false,
        runtimeVars: MutableMap<String, Any> = mutableMapOf()
    ): ActionStatus {
        val actionType = actionObj.get("action")?.asString?.lowercase() ?: return ActionStatus.SUCCESS
        val service = CompanionAccessibilityService.instance

        when (actionType) {
            "launch_app" -> {
                val rawPkg = actionObj.get("package")?.asString ?: ""
                val pkg = resolveRuntimeVariables(rawPkg, runtimeVars)
                if (pkg.isNotEmpty()) {
                    log("  -> Launching Application: $pkg")
                    try {
                        val launchIntent = context.packageManager.getLaunchIntentForPackage(pkg)
                        if (launchIntent != null) {
                            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
                            context.startActivity(launchIntent)
                            delay(2000)
                            return ActionStatus.SUCCESS
                        } else {
                            log("  -> Warning: No launch intent found for $pkg, attempting monkey launch")
                            Runtime.getRuntime().exec("monkey -p $pkg -c android.intent.category.LAUNCHER 1")
                            delay(2000)
                            return ActionStatus.SUCCESS
                        }
                    } catch (e: Exception) {
                        log("  -> Failed to launch app: ${e.message}")
                        return ActionStatus.FAILED
                    }
                }
                return ActionStatus.SUCCESS
            }

            "close_app" -> {
                val rawPkg = actionObj.get("package")?.asString ?: ""
                val pkg = resolveRuntimeVariables(rawPkg, runtimeVars)
                terminateApplicationSafely(context, service, pkg, log)
                return ActionStatus.SUCCESS
            }

            "click" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val target = resolveRuntimeVariables(rawTarget, runtimeVars)
                log("  -> Click: $target")
                if (service == null) {
                    log("  -> Error: Companion Accessibility Service is not active")
                    return ActionStatus.FAILED
                }
                val ok = retryUntilTrue(timeoutSeconds = 5) {
                    performClickOnTarget(service, target)
                }
                return if (ok) ActionStatus.SUCCESS else ActionStatus.FAILED
            }

            "wait_visible" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val target = resolveRuntimeVariables(rawTarget, runtimeVars)
                val timeout = actionObj.get("timeout")?.asInt ?: 15
                log("  -> Waiting for visibility of: $target (timeout: ${timeout}s)")
                if (service == null) return ActionStatus.FAILED
                val ok = retryUntilTrue(timeoutSeconds = timeout) {
                    isTargetVisible(service, target)
                }
                return if (ok) ActionStatus.SUCCESS else ActionStatus.FAILED
            }

            "wait_not_visible" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val target = resolveRuntimeVariables(rawTarget, runtimeVars)
                val timeout = actionObj.get("timeout")?.asInt ?: 15
                log("  -> Waiting for invisibility of: $target (timeout: ${timeout}s)")
                if (service == null) return ActionStatus.FAILED
                val ok = retryUntilTrue(timeoutSeconds = timeout) {
                    !isTargetVisible(service, target)
                }
                return if (ok) ActionStatus.SUCCESS else ActionStatus.FAILED
            }

            "assert_text" -> {
                val rawText = actionObj.get("text")?.asString ?: ""
                val text = resolveRuntimeVariables(rawText, runtimeVars)
                val timeout = actionObj.get("timeout")?.asInt ?: 15
                log("  -> Asserting text present on screen: '$text' (timeout: ${timeout}s)")
                if (service == null) return ActionStatus.FAILED
                val found = retryUntilTrue(timeoutSeconds = timeout) {
                    isTextPresentInHierarchy(service, text)
                }
                if (found) {
                    log("  -> Text '$text' verified successfully on UI tree.")
                } else {
                    log("  -> Verification failed: Text '$text' was not found on screen.")
                }
                return if (found) ActionStatus.SUCCESS else ActionStatus.FAILED
            }

            "input_text" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val target = resolveRuntimeVariables(rawTarget, runtimeVars)
                val rawText = actionObj.get("text")?.asString ?: ""
                val text = resolveRuntimeVariables(rawText, runtimeVars)
                log("  -> Input text: '$text' into '$target'")
                if (service == null) return ActionStatus.FAILED
                val ok = retryUntilTrue(timeoutSeconds = 5) {
                    performInputOnTarget(service, target, text)
                }
                return if (ok) ActionStatus.SUCCESS else ActionStatus.FAILED
            }

            "sleep" -> {
                val rawSec = actionObj.get("seconds")?.asString ?: "1.0"
                val resolvedSec = resolveRuntimeVariables(rawSec, runtimeVars).toFloatOrNull() ?: 1.0f
                log("  -> Sleep ${resolvedSec}s")
                delay((resolvedSec * 1000).toLong())
                return ActionStatus.SUCCESS
            }

            "press_key" -> {
                val keycode = actionObj.get("keycode")?.asInt ?: 4
                log("  -> Press keycode: $keycode")
                if (keycode == 4 && service != null) {
                    service.performGlobalAction(android.accessibilityservice.AccessibilityService.GLOBAL_ACTION_BACK)
                }
                delay(300)
                return ActionStatus.SUCCESS
            }

            "scroll_to_element", "scroll_until_visible" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val target = resolveRuntimeVariables(rawTarget, runtimeVars)
                val rawContainer = actionObj.get("container")?.asString
                val container = if (!rawContainer.isNullOrEmpty()) resolveRuntimeVariables(rawContainer, runtimeVars) else null
                val maxScrolls = actionObj.get("max_scrolls")?.asInt ?: 10
                val containerCriteria = if (!container.isNullOrEmpty()) com.lucasdeeiroz.robotrunner.model.LocatorCriteria.parse(container) else null

                log("  -> Scrolling to element: $target (max attempts: $maxScrolls)")
                if (service == null) {
                    log("  -> Error: Companion Accessibility Service is not active")
                    return ActionStatus.FAILED
                }

                var found = isTargetVisible(service, target)
                if (found) {
                    log("  -> Target element is already visible: $target")
                    return ActionStatus.SUCCESS
                }

                for (attempt in 1..maxScrolls) {
                    log("  -> Scroll attempt $attempt/$maxScrolls...")
                    service.performScrollOnContainer(containerCriteria, forward = true)
                    delay(700)
                    if (isTargetVisible(service, target)) {
                        log("  -> Target element found after $attempt scroll(s): $target")
                        found = true
                        break
                    }
                }
                return if (found) ActionStatus.SUCCESS else ActionStatus.FAILED
            }

            "scroll", "scroll_down", "scroll_forward" -> {
                val rawContainer = actionObj.get("container")?.asString ?: actionObj.get("target")?.asString
                val container = if (!rawContainer.isNullOrEmpty()) resolveRuntimeVariables(rawContainer, runtimeVars) else null
                val containerCriteria = if (!container.isNullOrEmpty()) com.lucasdeeiroz.robotrunner.model.LocatorCriteria.parse(container) else null
                log("  -> Scroll down / forward")
                if (service == null) return ActionStatus.FAILED
                val scrolled = service.performScrollOnContainer(containerCriteria, forward = true)
                delay(400)
                return if (scrolled) ActionStatus.SUCCESS else ActionStatus.FAILED
            }

            "scroll_up", "scroll_backward" -> {
                val rawContainer = actionObj.get("container")?.asString ?: actionObj.get("target")?.asString
                val container = if (!rawContainer.isNullOrEmpty()) resolveRuntimeVariables(rawContainer, runtimeVars) else null
                val containerCriteria = if (!container.isNullOrEmpty()) com.lucasdeeiroz.robotrunner.model.LocatorCriteria.parse(container) else null
                log("  -> Scroll up / backward")
                if (service == null) return ActionStatus.FAILED
                val scrolled = service.performScrollOnContainer(containerCriteria, forward = false)
                delay(400)
                return if (scrolled) ActionStatus.SUCCESS else ActionStatus.FAILED
            }

            "swipe" -> {
                val dm = context.resources.displayMetrics
                val w = dm.widthPixels.toFloat()
                val h = dm.heightPixels.toFloat()

                val rawSx = actionObj.get("start_x")?.asString ?: ""
                val rawSy = actionObj.get("start_y")?.asString ?: ""
                val rawEx = actionObj.get("end_x")?.asString ?: actionObj.get("offset_x")?.asString ?: ""
                val rawEy = actionObj.get("end_y")?.asString ?: actionObj.get("offset_y")?.asString ?: ""
                val rawDur = actionObj.get("duration")?.asString ?: "350"

                var sx = resolveRuntimeVariables(rawSx, runtimeVars).toFloatOrNull() ?: (w / 2f)
                var sy = resolveRuntimeVariables(rawSy, runtimeVars).toFloatOrNull() ?: (h * 0.75f)
                var ex = resolveRuntimeVariables(rawEx, runtimeVars).toFloatOrNull() ?: sx
                var ey = resolveRuntimeVariables(rawEy, runtimeVars).toFloatOrNull() ?: (h * 0.25f)
                val dur = resolveRuntimeVariables(rawDur, runtimeVars).replace("ms", "").toLongOrNull() ?: 350L

                // Clamp to safe screen bounds (avoid status bar / gesture navigation bar dead zones)
                sy = sy.coerceIn(120f, h - 180f)
                ey = ey.coerceIn(120f, h - 180f)
                sx = sx.coerceIn(50f, w - 50f)
                ex = ex.coerceIn(50f, w - 50f)

                log("  -> Swipe gesture: ($sx, $sy) -> ($ex, $ey) duration=${dur}ms")
                if (service == null) {
                    log("  -> Error: Companion Accessibility Service is not active")
                    return ActionStatus.FAILED
                }
                val swiped = service.performSwipe(sx, sy, ex, ey, dur)
                if (!swiped) {
                    log("  -> Swipe gesture could not be completed via AccessibilityService")
                }
                return if (swiped) ActionStatus.SUCCESS else ActionStatus.FAILED
            }

            "get_element_rect" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val target = resolveRuntimeVariables(rawTarget, runtimeVars)
                val assignVar = cleanAssignName(actionObj.get("assign")?.asString ?: "rect")
                log("  -> Get Element Rect of: $target -> \$$assignVar")
                if (service == null) return ActionStatus.FAILED
                val criteria = com.lucasdeeiroz.robotrunner.model.LocatorCriteria.parse(target)
                val node = service.findFirstMatchingNode(criteria)
                if (node != null) {
                    val r = android.graphics.Rect()
                    node.getBoundsInScreen(r)
                    val rectMap = mapOf(
                        "x" to r.left,
                        "y" to r.top,
                        "width" to r.width(),
                        "height" to r.height(),
                        "left" to r.left,
                        "top" to r.top,
                        "right" to r.right,
                        "bottom" to r.bottom
                    )
                    runtimeVars[assignVar] = rectMap
                    log("  -> Rect: $rectMap")
                    return ActionStatus.SUCCESS
                } else {
                    log("  -> Element not found for Get Element Rect: $target")
                    val dm = context.resources.displayMetrics
                    runtimeVars[assignVar] = mapOf("x" to 0, "y" to 0, "width" to dm.widthPixels, "height" to dm.heightPixels)
                    return ActionStatus.SUCCESS
                }
            }

            "get_element_location" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val target = resolveRuntimeVariables(rawTarget, runtimeVars)
                val assignVar = cleanAssignName(actionObj.get("assign")?.asString ?: "location")
                val criteria = com.lucasdeeiroz.robotrunner.model.LocatorCriteria.parse(target)
                val node = service?.findFirstMatchingNode(criteria)
                val r = android.graphics.Rect()
                if (node != null) node.getBoundsInScreen(r)
                runtimeVars[assignVar] = mapOf("x" to r.left, "y" to r.top)
                return ActionStatus.SUCCESS
            }

            "get_element_size" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val target = resolveRuntimeVariables(rawTarget, runtimeVars)
                val assignVar = cleanAssignName(actionObj.get("assign")?.asString ?: "size")
                val criteria = com.lucasdeeiroz.robotrunner.model.LocatorCriteria.parse(target)
                val node = service?.findFirstMatchingNode(criteria)
                val r = android.graphics.Rect()
                if (node != null) node.getBoundsInScreen(r)
                runtimeVars[assignVar] = mapOf("width" to r.width(), "height" to r.height())
                return ActionStatus.SUCCESS
            }

            "get_text" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val target = resolveRuntimeVariables(rawTarget, runtimeVars)
                val assignVar = cleanAssignName(actionObj.get("assign")?.asString ?: "text")
                val criteria = com.lucasdeeiroz.robotrunner.model.LocatorCriteria.parse(target)
                val node = service?.findFirstMatchingNode(criteria)
                val txt = node?.text?.toString() ?: node?.contentDescription?.toString() ?: ""
                runtimeVars[assignVar] = txt
                log("  -> Get Text: '$txt' -> \$$assignVar")
                return ActionStatus.SUCCESS
            }

            "get_element_attribute" -> {
                val rawTarget = actionObj.get("target")?.asString ?: ""
                val target = resolveRuntimeVariables(rawTarget, runtimeVars)
                val attr = actionObj.get("attribute")?.asString ?: "content-desc"
                val assignVar = cleanAssignName(actionObj.get("assign")?.asString ?: "attr")
                val criteria = com.lucasdeeiroz.robotrunner.model.LocatorCriteria.parse(target)
                val node = service?.findFirstMatchingNode(criteria)
                val valStr = when (attr.lowercase()) {
                    "text" -> node?.text?.toString() ?: ""
                    "content-desc", "contentdescription", "description" -> node?.contentDescription?.toString() ?: ""
                    "resource-id", "resourceid", "id" -> node?.viewIdResourceName ?: ""
                    "class", "classname" -> node?.className?.toString() ?: ""
                    "package" -> node?.packageName?.toString() ?: ""
                    "clickable" -> node?.isClickable?.toString() ?: "false"
                    "scrollable" -> node?.isScrollable?.toString() ?: "false"
                    "enabled" -> node?.isEnabled?.toString() ?: "true"
                    "selected" -> node?.isSelected?.toString() ?: "false"
                    "focused" -> node?.isFocused?.toString() ?: "false"
                    else -> ""
                }
                runtimeVars[assignVar] = valStr
                return ActionStatus.SUCCESS
            }

            "evaluate" -> {
                val rawExpr = actionObj.get("expression")?.asString ?: ""
                val assignVar = cleanAssignName(actionObj.get("assign")?.asString ?: "result")
                val resolvedExpr = resolveRuntimeVariables(rawExpr, runtimeVars)
                val res = evalMathExpression(resolvedExpr)
                runtimeVars[assignVar] = res
                log("  -> Evaluate: $resolvedExpr = $res -> \$$assignVar")
                return ActionStatus.SUCCESS
            }

            "convert_to_integer", "convert_to_int" -> {
                val rawVal = actionObj.get("value")?.asString ?: ""
                val assignVar = cleanAssignName(actionObj.get("assign")?.asString ?: rawVal)
                val resolved = resolveRuntimeVariables(rawVal, runtimeVars)
                val intVal = resolved.toDoubleOrNull()?.toInt() ?: resolved.toIntOrNull() ?: 0
                runtimeVars[assignVar] = intVal
                log("  -> Convert To Integer: $resolved -> $intVal (\$$assignVar)")
                return ActionStatus.SUCCESS
            }

            "convert_to_number", "convert_to_float" -> {
                val rawVal = actionObj.get("value")?.asString ?: ""
                val assignVar = cleanAssignName(actionObj.get("assign")?.asString ?: rawVal)
                val resolved = resolveRuntimeVariables(rawVal, runtimeVars)
                val numVal = resolved.toDoubleOrNull() ?: 0.0
                runtimeVars[assignVar] = numVal
                return ActionStatus.SUCCESS
            }

            "convert_to_string", "convert_to_text" -> {
                val rawVal = actionObj.get("value")?.asString ?: ""
                val assignVar = cleanAssignName(actionObj.get("assign")?.asString ?: rawVal)
                val resolved = resolveRuntimeVariables(rawVal, runtimeVars)
                runtimeVars[assignVar] = resolved
                return ActionStatus.SUCCESS
            }

            "set_variable" -> {
                val rawVal = actionObj.get("value")?.asString ?: ""
                val assignVar = cleanAssignName(actionObj.get("assign")?.asString ?: "var")
                val resolved = resolveRuntimeVariables(rawVal, runtimeVars)
                runtimeVars[assignVar] = resolved
                return ActionStatus.SUCCESS
            }

            "fail" -> {
                val rawMsg = actionObj.get("message")?.asString ?: "Test failed explicitly"
                val msg = resolveRuntimeVariables(rawMsg, runtimeVars)
                log("  -> Fail: $msg")
                return ActionStatus.FAILED
            }

            "break" -> {
                log("  -> Loop BREAK")
                return ActionStatus.BREAK
            }

            "continue" -> {
                log("  -> Loop CONTINUE")
                return ActionStatus.CONTINUE
            }

            "run_keyword_and_return_status" -> {
                val assignVar = cleanAssignName(actionObj.get("assign")?.asString ?: "status")
                val nestedAction = actionObj.getAsJsonObject("nested_action")
                log("  -> Run Keyword And Return Status...")
                val ok = if (nestedAction != null) {
                    val status = executeAction(context, nestedAction, log, isDesktopExecution, runtimeVars)
                    status == ActionStatus.SUCCESS
                } else false
                runtimeVars[assignVar] = ok
                log("  -> Status result: $ok -> \$$assignVar")
                return ActionStatus.SUCCESS
            }

            "for_loop" -> {
                val varName = cleanAssignName(actionObj.get("var")?.asString ?: "i")
                val rawStart = actionObj.get("start")?.asString ?: "0"
                val rawEnd = actionObj.get("end")?.asString ?: "1"
                val rawStep = actionObj.get("step")?.asString ?: "1"

                val startVal = resolveRuntimeVariables(rawStart, runtimeVars).toDoubleOrNull()?.toInt() ?: 0
                val endVal = resolveRuntimeVariables(rawEnd, runtimeVars).toDoubleOrNull()?.toInt() ?: 1
                val stepVal = resolveRuntimeVariables(rawStep, runtimeVars).toDoubleOrNull()?.toInt() ?: 1
                val body = actionObj.getAsJsonArray("body") ?: JsonArray()

                log("  -> FOR \$$varName IN RANGE $startVal to $endVal (step $stepVal)")
                var loopBreak = false
                var i = startVal
                while (if (stepVal > 0) i < endVal else i > endVal) {
                    runtimeVars[varName] = i
                    log("  -> [Loop Iteration \$$varName = $i]")
                    for (k in 0 until body.size()) {
                        val act = body.get(k).asJsonObject
                        val status = executeAction(context, act, log, isDesktopExecution, runtimeVars)
                        if (status == ActionStatus.BREAK) {
                            loopBreak = true
                            break
                        } else if (status == ActionStatus.CONTINUE) {
                            break
                        } else if (status == ActionStatus.FAILED) {
                            return ActionStatus.FAILED
                        }
                    }
                    if (loopBreak) break
                    i += stepVal
                }
                return ActionStatus.SUCCESS
            }

            "if" -> {
                val branches = actionObj.getAsJsonArray("branches") ?: JsonArray()
                for (k in 0 until branches.size()) {
                    val branch = branches.get(k).asJsonObject
                    val branchType = branch.get("type")?.asString?.uppercase() ?: "IF"
                    val rawCondition = branch.get("condition")?.asString
                    val condition = if (!rawCondition.isNullOrEmpty()) resolveRuntimeVariables(rawCondition, runtimeVars) else ""
                    val shouldExecute = if (branchType == "ELSE" || condition.isEmpty()) {
                        true
                    } else {
                        evalCondition(condition)
                    }

                    if (shouldExecute) {
                        log("  -> Executing branch: $branchType ${if (condition.isNotEmpty()) "($condition)" else ""}")
                        val body = branch.getAsJsonArray("body") ?: JsonArray()
                        for (m in 0 until body.size()) {
                            val act = body.get(m).asJsonObject
                            val status = executeAction(context, act, log, isDesktopExecution, runtimeVars)
                            if (status != ActionStatus.SUCCESS) {
                                return status
                            }
                        }
                        break
                    }
                }
                return ActionStatus.SUCCESS
            }

            else -> {
                log("  -> Skipping unhandled action: $actionType")
                return ActionStatus.SUCCESS
            }
        }
    }

    private suspend fun executeKeywordFallback(
        context: Context,
        keyword: String,
        args: JsonArray?,
        log: (String) -> Unit,
        isDesktopExecution: Boolean = false
    ): Boolean {
        val service = CompanionAccessibilityService.instance
        val low = keyword.lowercase()

        if (low.contains("clico") || low.contains("click") || low.contains("seleciono")) {
            if (args != null && args.size() > 0) {
                val target = args.get(0).asString
                log("  -> [Fallback Click] $target")
                if (service == null) return false
                return retryUntilTrue(5) { performClickOnTarget(service, target) }
            }
        } else if (low.contains("valida") || low.contains("assert") || low.contains("contém") || low.contains("visible")) {
            if (args != null && args.size() > 0) {
                val text = args.get(0).asString
                log("  -> [Fallback Assert] $text")
                if (service == null) return false
                return retryUntilTrue(10) { isTargetVisible(service, text) || isTextPresentInHierarchy(service, text) }
            }
        } else if (low.contains("scroll") || low.contains("swipe") || low.contains("rolar")) {
            log("  -> [Fallback Scroll/Swipe]")
            if (service == null) return false
            return service.performScrollOnContainer(null, forward = true)
        } else if (low.contains("fechar") || low.contains("terminate") || low.contains("close")) {
            val pkg = if (args != null && args.size() > 0) args.get(0).asString else ""
            terminateApplicationSafely(context, service, pkg, log)
            return true
        }
        return true
    }

    private suspend fun terminateApplicationSafely(
        context: Context,
        service: CompanionAccessibilityService?,
        pkg: String,
        log: (String) -> Unit
    ) {
        log("  -> Terminating Application: $pkg")
        try {
            if (pkg.isNotEmpty()) {
                // Tier 1: Automated Force Stop via Settings + Accessibility Service
                if (service != null) {
                    val stopped = service.forceStopPackageViaSettings(context, pkg, log)
                    if (stopped) {
                        log("  -> Target app successfully terminated: $pkg")
                        return
                    }
                }

                // Tier 2: Bring Companion back to Foreground (pushes target app to background)
                try {
                    val companionIntent = Intent(context, com.lucasdeeiroz.robotrunner.MainActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                    }
                    context.startActivity(companionIntent)
                } catch (e: Exception) {
                    Log.w(TAG, "Failed bringing companion to front: ${e.message}")
                }
                delay(300)

                // Tier 3: Kill background processes of target app
                try {
                    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? android.app.ActivityManager
                    am?.killBackgroundProcesses(pkg)
                    log("  -> Background processes killed: $pkg")
                } catch (e: Exception) {
                    Log.w(TAG, "killBackgroundProcesses failed: ${e.message}")
                }

                // Tier 4: Direct ActivityManager forceStopPackage reflection (if privileged)
                try {
                    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? android.app.ActivityManager
                    val forceStopMethod = am?.javaClass?.getMethod("forceStopPackage", String::class.java)
                    forceStopMethod?.invoke(am, pkg)
                } catch (_: Exception) {}

                // Tier 5: Shell force-stop (if privileged shell available)
                try {
                    Runtime.getRuntime().exec(arrayOf("am", "force-stop", pkg))
                } catch (_: Exception) {}
            }
        } catch (e: Exception) {
            log("  -> Error terminating app: ${e.message}")
        }
        delay(300)
    }

    private fun performClickOnTarget(service: CompanionAccessibilityService, rawTarget: String): Boolean {
        val criteria = com.lucasdeeiroz.robotrunner.model.LocatorCriteria.parse(rawTarget)
        return service.performNodeActionByCriteria(
            criteria = criteria,
            action = "click"
        )
    }

    private fun performInputOnTarget(service: CompanionAccessibilityService, rawTarget: String, textValue: String): Boolean {
        val criteria = com.lucasdeeiroz.robotrunner.model.LocatorCriteria.parse(rawTarget)
        return service.performNodeActionByCriteria(
            criteria = criteria,
            action = "input",
            textValue = textValue
        )
    }

    private fun isTargetVisible(service: CompanionAccessibilityService, rawTarget: String): Boolean {
        val criteria = com.lucasdeeiroz.robotrunner.model.LocatorCriteria.parse(rawTarget)
        val root = service.rootInActiveWindow ?: return false
        return findNodeByCriteria(root, criteria) != null
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

    private fun findNodeByCriteria(node: AccessibilityNodeInfo, criteria: com.lucasdeeiroz.robotrunner.model.LocatorCriteria): AccessibilityNodeInfo? {
        if (criteria.matches(node)) return node

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val match = findNodeByCriteria(child, criteria)
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
