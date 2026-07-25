package com.robotrunner.companion.bdd

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.robotrunner.companion.R
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun BddTestRunnerTabContent() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val suites = remember { BddRunnerEngine.getSampleSuites() }
    var selectedSuite by remember { mutableStateOf(suites.first()) }
    var isRunning by remember { mutableStateOf(BddRunnerEngine.isRunning) }
    var currentReport by remember { mutableStateOf<BddExecutionReport?>(null) }
    var refreshTrigger by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        while (true) {
            isRunning = BddRunnerEngine.isRunning
            delay(300)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Suite Controls Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = stringResource(id = R.string.header_bdd_runner),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Text(
                    text = stringResource(id = R.string.desc_bdd_runner),
                    fontSize = 11.sp,
                    color = Color(0xFF94A3B8)
                )

                Spacer(modifier = Modifier.height(14.dp))

                Text(
                    text = "Selected Suite: ${selectedSuite.name}",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF38BDF8)
                )

                Spacer(modifier = Modifier.height(10.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            if (isRunning) {
                                BddRunnerEngine.stopExecution()
                                isRunning = false
                            } else {
                                isRunning = true
                                BddRunnerEngine.runSuite(
                                    suite = selectedSuite,
                                    scope = coroutineScope,
                                    onStepUpdated = { refreshTrigger++ },
                                    onCompleted = { rep ->
                                        currentReport = rep
                                        isRunning = false
                                    }
                                )
                            }
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isRunning) Color(0xFFEF4444) else Color(0xFF6366F1)
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = if (isRunning) stringResource(id = R.string.btn_stop_suite) else stringResource(id = R.string.btn_run_suite),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Button(
                        onClick = {
                            currentReport?.let { rep ->
                                coroutineScope.launch {
                                    val file = BddRunnerEngine.exportReportHtml(rep)
                                    if (file != null) {
                                        Toast.makeText(context, context.getString(R.string.msg_report_exported, file.name), Toast.LENGTH_LONG).show()
                                    }
                                }
                            }
                        },
                        enabled = currentReport != null,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(text = stringResource(id = R.string.btn_export_html_report), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Execution Summary Card
        currentReport?.let { rep ->
            val passRate = if (rep.totalScenarios > 0) (rep.passedScenarios * 100) / rep.totalScenarios else 0
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
                shape = RoundedCornerShape(14.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(text = "SUITE SUMMARY", fontSize = 10.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.Bold)
                        Text(
                            text = "Passed: ${rep.passedScenarios}/${rep.totalScenarios} Scenarios",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    }

                    Surface(
                        color = if (passRate == 100) Color(0xFF22C55E) else Color(0xFFF59E0B),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = "$passRate% PASS RATE",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }

        // Live Execution Console Stream
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Gherkin Scenario Stream",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )

                Spacer(modifier = Modifier.height(10.dp))

                key(refreshTrigger) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        selectedSuite.scenarios.forEach { scenario ->
                            ScenarioItemBox(scenario = scenario)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ScenarioItemBox(scenario: BddScenario) {
    Surface(
        color = Color(0xFF0F172A),
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = scenario.title, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color.White)
                Text(
                    text = scenario.status.name,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = when (scenario.status) {
                        ScenarioStatus.PASSED -> Color(0xFF22C55E)
                        ScenarioStatus.FAILED -> Color(0xFFEF4444)
                        ScenarioStatus.RUNNING -> Color(0xFF38BDF8)
                        else -> Color(0xFF64748B)
                    }
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            scenario.steps.forEach { step ->
                StepRow(step = step)
            }
        }
    }
}

@Composable
fun StepRow(step: BddStep) {
    val statusColor = when (step.status) {
        StepStatus.PASSED -> Color(0xFF22C55E)
        StepStatus.FAILED -> Color(0xFFEF4444)
        StepStatus.RUNNING -> Color(0xFF38BDF8)
        StepStatus.SKIPPED -> Color(0xFF64748B)
        else -> Color(0xFF94A3B8)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "[${step.status.name.take(4)}]",
            color = statusColor,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = "${step.keyword} ",
            color = Color(0xFFC084FC),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = "${step.action} ${step.targetLocator ?: ""} ${step.textValue ?: ""}",
            color = Color.White,
            fontSize = 11.sp,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.weight(1f)
        )
    }
}
