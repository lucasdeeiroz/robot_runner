package com.lucasdeeiroz.robotrunner.bdd

enum class StepStatus {
    PENDING,
    RUNNING,
    PASSED,
    FAILED,
    SKIPPED
}

enum class ScenarioStatus {
    NOT_STARTED,
    RUNNING,
    PASSED,
    FAILED
}

data class BddStep(
    val id: String,
    val keyword: String,
    val action: String,
    val targetLocator: String? = null,
    val textValue: String? = null,
    val delayMs: Long = 0,
    var status: StepStatus = StepStatus.PENDING,
    var errorMessage: String? = null,
    var durationMs: Long = 0
)

data class BddScenario(
    val id: String,
    val title: String,
    val description: String,
    val steps: List<BddStep>,
    var status: ScenarioStatus = ScenarioStatus.NOT_STARTED,
    var durationMs: Long = 0
)

data class BddTestSuite(
    val id: String,
    val name: String,
    val description: String,
    val scenarios: List<BddScenario>
)

data class BddExecutionReport(
    val reportId: String,
    val suiteName: String,
    val startTime: Long,
    val endTime: Long,
    val totalScenarios: Int,
    val passedScenarios: Int,
    val failedScenarios: Int,
    val scenarios: List<BddScenario>
)
