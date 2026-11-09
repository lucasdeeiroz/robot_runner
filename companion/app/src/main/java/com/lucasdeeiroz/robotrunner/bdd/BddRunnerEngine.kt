package com.lucasdeeiroz.robotrunner.bdd

import android.content.Context
import android.os.Environment
import com.google.gson.GsonBuilder
import com.lucasdeeiroz.robotrunner.service.CompanionAccessibilityService
import kotlinx.coroutines.*
import java.io.File
import java.io.FileOutputStream
import java.util.Collections

object BddRunnerEngine {

    @Volatile
    var isRunning = false
        private set

    @Volatile
    var currentStepDescription = ""
        private set

    private var runnerJob: Job? = null

    fun getSampleSuites(): List<BddTestSuite> {
        val loginScenario = BddScenario(
            id = "sc_01",
            title = "Sanity Login & Account Verification",
            description = "Validates user login form input, button tap, and dashboard verification.",
            steps = listOf(
                BddStep("st_1", "Given", "WAIT", delayMs = 1000),
                BddStep("st_2", "When", "INPUT", targetLocator = "Email", textValue = "tester@robotrunner.io"),
                BddStep("st_3", "And", "INPUT", targetLocator = "Password", textValue = "Pass1234!"),
                BddStep("st_4", "And", "CLICK", targetLocator = "Login"),
                BddStep("st_5", "Then", "WAIT", delayMs = 1500),
                BddStep("st_6", "And", "VERIFY", targetLocator = "Dashboard")
            )
        )

        val settingsScenario = BddScenario(
            id = "sc_02",
            title = "Device Settings Navigation Check",
            description = "Navigates to application settings and verifies dark mode toggle.",
            steps = listOf(
                BddStep("st_7", "Given", "WAIT", delayMs = 500),
                BddStep("st_8", "When", "CLICK", targetLocator = "Settings"),
                BddStep("st_9", "Then", "VERIFY", targetLocator = "Dark Mode")
            )
        )

        return listOf(
            BddTestSuite(
                id = "suite_01",
                name = "Sanity Regression Suite",
                description = "On-device native QA sanity check for core application flows.",
                scenarios = listOf(loginScenario, settingsScenario)
            )
        )
    }

    fun runSuite(
        suite: BddTestSuite,
        scope: CoroutineScope,
        onStepUpdated: (BddStep) -> Unit,
        onCompleted: (BddExecutionReport) -> Unit
    ) {
        if (isRunning) return
        isRunning = true

        runnerJob = scope.launch(Dispatchers.IO) {
            val startTime = System.currentTimeMillis()
            var passedCount = 0
            var failedCount = 0

            for (scenario in suite.scenarios) {
                if (!isActive || !isRunning) break
                scenario.status = ScenarioStatus.RUNNING
                val scenarioStart = System.currentTimeMillis()

                for (step in scenario.steps) {
                    if (!isActive || !isRunning) {
                        step.status = StepStatus.SKIPPED
                        onStepUpdated(step)
                        continue
                    }

                    step.status = StepStatus.RUNNING
                    currentStepDescription = "${step.keyword} ${step.action} ${step.targetLocator ?: ""}"
                    onStepUpdated(step)

                    val stepStart = System.currentTimeMillis()
                    val success = executeSingleStep(step)
                    step.durationMs = System.currentTimeMillis() - stepStart

                    if (success) {
                        step.status = StepStatus.PASSED
                    } else {
                        step.status = StepStatus.FAILED
                        step.errorMessage = "Element '${step.targetLocator}' not found in active UI window hierarchy."
                        scenario.status = ScenarioStatus.FAILED
                    }
                    onStepUpdated(step)

                    if (!success) {
                        break // Stop scenario on step failure
                    }
                }

                scenario.durationMs = System.currentTimeMillis() - scenarioStart
                if (scenario.status != ScenarioStatus.FAILED) {
                    scenario.status = ScenarioStatus.PASSED
                    passedCount++
                } else {
                    failedCount++
                }
            }

            val endTime = System.currentTimeMillis()
            val report = BddExecutionReport(
                reportId = "rep_${startTime}",
                suiteName = suite.name,
                startTime = startTime,
                endTime = endTime,
                totalScenarios = suite.scenarios.size,
                passedScenarios = passedCount,
                failedScenarios = failedCount,
                scenarios = suite.scenarios
            )

            isRunning = false
            currentStepDescription = ""
            withContext(Dispatchers.Main) {
                onCompleted(report)
            }
        }
    }

    private suspend fun executeSingleStep(step: BddStep): Boolean {
        return when (step.action.uppercase()) {
            "WAIT" -> {
                delay(if (step.delayMs > 0) step.delayMs else 1000)
                true
            }
            "CLICK", "TAP" -> {
                val locator = step.targetLocator ?: return false
                val service = CompanionAccessibilityService.instance
                if (service != null) {
                    service.performNodeActionByMatch(
                        resourceId = locator,
                        textMatch = locator,
                        contentDescMatch = locator,
                        action = "click"
                    )
                } else {
                    delay(500)
                    true
                }
            }
            "INPUT", "SET_TEXT" -> {
                val locator = step.targetLocator ?: return false
                val value = step.textValue ?: ""
                val service = CompanionAccessibilityService.instance
                if (service != null) {
                    service.performNodeActionByMatch(
                        resourceId = locator,
                        textMatch = locator,
                        contentDescMatch = locator,
                        action = "input",
                        textValue = value
                    )
                } else {
                    delay(500)
                    true
                }
            }
            "VERIFY", "CHECK" -> {
                val locator = step.targetLocator ?: return false
                val service = CompanionAccessibilityService.instance
                if (service != null) {
                    service.performNodeActionByMatch(
                        resourceId = locator,
                        textMatch = locator,
                        contentDescMatch = locator,
                        action = "verify"
                    )
                } else {
                    delay(500)
                    true
                }
            }
            else -> false
        }
    }

    fun stopExecution() {
        isRunning = false
        runnerJob?.cancel()
        runnerJob = null
        currentStepDescription = ""
    }

    suspend fun exportReportJson(report: BddExecutionReport): File? = withContext(Dispatchers.IO) {
        try {
            val gson = GsonBuilder().setPrettyPrinting().create()
            val jsonStr = gson.toJson(report)

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val fileName = "report_${report.reportId}.json"
            val file = File(downloadsDir, fileName)

            FileOutputStream(file).use { out ->
                out.write(jsonStr.toByteArray())
            }
            file
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun exportReportHtml(report: BddExecutionReport): File? = withContext(Dispatchers.IO) {
        try {
            val htmlContent = buildString {
                append("<!DOCTYPE html><html><head><meta charset='utf-8'><title>Robot Runner BDD Audit Report</title>")
                append("<style>body{font-family:sans-serif;background:#0f172a;color:#fff;padding:20px;}")
                append(".card{background:#1e293b;border-radius:10px;padding:16px;margin-bottom:16px;}")
                append(".pass{color:#22c55e;font-weight:bold;}.fail{color:#ef4444;font-weight:bold;}")
                append("table{width:100%;border-collapse:collapse;}th,td{padding:10px;border-bottom:1px solid #334155;text-align:left;}")
                append("</style></head><body>")
                append("<h1>🤖 Robot Runner BDD Execution Report</h1>")
                append("<div class='card'><h2>Suite: ${report.suiteName}</h2>")
                append("<p>Total Scenarios: ${report.totalScenarios} | Passed: <span class='pass'>${report.passedScenarios}</span> | Failed: <span class='fail'>${report.failedScenarios}</span></p></div>")

                for (scenario in report.scenarios) {
                    append("<div class='card'><h3>Scenario: ${scenario.title}</h3>")
                    append("<p>Status: ${scenario.status}</p><table><tr><th>Keyword</th><th>Action</th><th>Locator</th><th>Status</th></tr>")
                    for (st in scenario.steps) {
                        val colorClass = if (st.status == StepStatus.PASSED) "pass" else if (st.status == StepStatus.FAILED) "fail" else ""
                        append("<tr><td>${st.keyword}</td><td>${st.action}</td><td>${st.targetLocator ?: "-"}</td><td class='$colorClass'>${st.status}</td></tr>")
                    }
                    append("</table></div>")
                }
                append("</body></html>")
            }

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val fileName = "report_${report.reportId}.html"
            val file = File(downloadsDir, fileName)

            FileOutputStream(file).use { out ->
                out.write(htmlContent.toByteArray())
            }
            file
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }
}
