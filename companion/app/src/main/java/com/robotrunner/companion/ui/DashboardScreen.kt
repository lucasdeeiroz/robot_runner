package com.robotrunner.companion.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.robotrunner.companion.R
import com.robotrunner.companion.apps.PackageManagerTabContent
import com.robotrunner.companion.bdd.BddTestRunnerTabContent
import com.robotrunner.companion.explorer.ExplorerTabContent
import com.robotrunner.companion.inspector.InspectorTabContent
import com.robotrunner.companion.logcat.LogcatTabContent
import com.robotrunner.companion.model.HardwareSpecCategory
import com.robotrunner.companion.model.LiveTelemetry
import com.robotrunner.companion.net.NetworkTabContent
import com.robotrunner.companion.performance.PerformanceTabContent
import com.robotrunner.companion.shell.ShellConsoleTabContent
import com.robotrunner.companion.stopwatch.StopwatchTabContent
import com.robotrunner.companion.sync.SyncCenterTabContent

@Composable
fun DashboardScreen(
    telemetry: LiveTelemetry,
    detailedSpecs: List<HardwareSpecCategory>,
    ipAddress: String,
    port: Int,
    onToggleServer: () -> Unit,
    onRunOfflineCheckup: () -> Unit,
    onLaunchDisplayTest: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val context = LocalContext.current

    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Color(0xFF6366F1),
            secondary = Color(0xFF38BDF8),
            surface = Color(0xFF0F172A),
            background = Color(0xFF090D16),
            surfaceVariant = Color(0xFF1E293B)
        )
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // App Bar Header
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF0F172A))
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = stringResource(id = R.string.app_name),
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = stringResource(id = R.string.subtitle_agent),
                        fontSize = 12.sp,
                        color = Color(0xFF94A3B8)
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    // Tab Selection Bar
                    ScrollableTabRow(
                        selectedTabIndex = selectedTab,
                        containerColor = Color(0xFF1E293B),
                        contentColor = Color(0xFF38BDF8),
                        edgePadding = 8.dp,
                        modifier = Modifier.height(44.dp)
                    ) {
                        Tab(
                            selected = selectedTab == 0,
                            onClick = { selectedTab = 0 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_dashboard),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 1,
                            onClick = { selectedTab = 1 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_hardware_specs),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 2,
                            onClick = { selectedTab = 2 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_network),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 3,
                            onClick = { selectedTab = 3 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_stopwatch),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 4,
                            onClick = { selectedTab = 4 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_inspector),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 5,
                            onClick = { selectedTab = 5 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_explorer),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 6,
                            onClick = { selectedTab = 6 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_bdd_runner),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 7,
                            onClick = { selectedTab = 7 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_logcat),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 8,
                            onClick = { selectedTab = 8 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_performance),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 9,
                            onClick = { selectedTab = 9 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_apps),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 10,
                            onClick = { selectedTab = 10 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_shell),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 11,
                            onClick = { selectedTab = 11 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_diagnostics),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                        Tab(
                            selected = selectedTab == 12,
                            onClick = { selectedTab = 12 },
                            text = {
                                Text(
                                    text = stringResource(id = R.string.tab_sync_center),
                                    fontSize = 11.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    maxLines = 1,
                                    softWrap = false,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                        )
                    }
                }

                // Tab Content
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    when (selectedTab) {
                        0 -> DashboardTabContent(
                            telemetry = telemetry,
                            ipAddress = ipAddress,
                            port = port,
                            onToggleServer = onToggleServer,
                            context = context
                        )
                        1 -> HardwareSpecsTabContent(detailedSpecs = detailedSpecs)
                        2 -> NetworkTabContent(
                            ipAddress = ipAddress,
                            port = port,
                            isServerRunning = telemetry.isServerRunning,
                            activeClients = telemetry.activeClientsCount,
                            onToggleServer = onToggleServer
                        )
                        3 -> StopwatchTabContent()
                        4 -> InspectorTabContent()
                        5 -> ExplorerTabContent()
                        6 -> BddTestRunnerTabContent()
                        7 -> LogcatTabContent()
                        8 -> PerformanceTabContent()
                        9 -> PackageManagerTabContent()
                        10 -> ShellConsoleTabContent()
                        11 -> DiagnosticsTabContent(
                            onRunOfflineCheckup = onRunOfflineCheckup,
                            onLaunchDisplayTest = onLaunchDisplayTest
                        )
                        12 -> SyncCenterTabContent()
                    }
                }
            }
        }
    }
}

@Composable
fun DashboardTabContent(
    telemetry: LiveTelemetry,
    ipAddress: String,
    port: Int,
    onToggleServer: () -> Unit,
    context: Context
) {
    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(14.dp),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        // Status Row (Server & Accessibility)
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Server Status Card
                Card(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(stringResource(id = R.string.label_rest_server), color = Color(0xFF94A3B8), fontSize = 12.sp)
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .background(
                                        color = if (telemetry.isServerRunning) Color(0xFF10B981) else Color(0xFFEF4444),
                                        shape = CircleShape
                                    )
                            )
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = if (telemetry.isServerRunning) stringResource(id = R.string.status_port_active, port) else stringResource(id = R.string.status_server_offline),
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = if (telemetry.isServerRunning) stringResource(id = R.string.subtext_server_ip, ipAddress) else stringResource(id = R.string.subtext_tap_start),
                            color = Color(0xFF64748B),
                            fontSize = 11.sp
                        )
                    }
                }

                // Accessibility Status Card
                Card(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(stringResource(id = R.string.label_accessibility), color = Color(0xFF94A3B8), fontSize = 12.sp)
                            Box(
                                modifier = Modifier
                                    .size(10.dp)
                                    .background(
                                        color = if (telemetry.isAccessibilityActive) Color(0xFF10B981) else Color(0xFFF59E0B),
                                        shape = CircleShape
                                    )
                            )
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = if (telemetry.isAccessibilityActive) stringResource(id = R.string.status_sub10ms_bridge) else stringResource(id = R.string.status_bridge_off),
                            color = Color.White,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = if (telemetry.isAccessibilityActive) stringResource(id = R.string.subtext_ready_dump) else stringResource(id = R.string.subtext_grant_adb),
                            color = Color(0xFF64748B),
                            fontSize = 11.sp
                        )
                    }
                }
            }
        }

        // Live Resource Gauges Header
        item {
            Text(
                text = stringResource(id = R.string.header_live_metrics),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier.padding(top = 4.dp, bottom = 2.dp)
            )
        }

        // CPU & RAM Gauges Row
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                MetricGaugeCard(
                    modifier = Modifier.weight(1f),
                    title = stringResource(id = R.string.gauge_cpu_title),
                    valueText = "${telemetry.cpuUsagePercent}%",
                    progress = telemetry.cpuUsagePercent / 100f,
                    subText = stringResource(id = R.string.gauge_cpu_sub),
                    barColor = if (telemetry.cpuUsagePercent > 80) Color(0xFFEF4444) else Color(0xFF6366F1)
                )

                MetricGaugeCard(
                    modifier = Modifier.weight(1f),
                    title = stringResource(id = R.string.gauge_ram_title),
                    valueText = "${telemetry.ramPercent}%",
                    progress = telemetry.ramPercent / 100f,
                    subText = "${telemetry.ramUsedMb} MB / ${telemetry.ramTotalMb} MB",
                    barColor = if (telemetry.ramPercent > 85) Color(0xFFEF4444) else Color(0xFF38BDF8)
                )
            }
        }

        // Battery & Storage Gauges Row
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                MetricGaugeCard(
                    modifier = Modifier.weight(1f),
                    title = stringResource(id = R.string.gauge_battery_title),
                    valueText = "${telemetry.batteryPercent}% ${if (telemetry.isCharging) "⚡" else ""}",
                    progress = telemetry.batteryPercent / 100f,
                    subText = "${telemetry.batteryTempC}°C | ${telemetry.batteryVoltageMv}mV",
                    barColor = if (telemetry.batteryPercent <= 20) Color(0xFFF59E0B) else Color(0xFF10B981)
                )

                MetricGaugeCard(
                    modifier = Modifier.weight(1f),
                    title = stringResource(id = R.string.gauge_storage_title),
                    valueText = "${telemetry.storagePercent}%",
                    progress = telemetry.storagePercent / 100f,
                    subText = String.format("%.1f GB / %.1f GB", telemetry.storageUsedGb, telemetry.storageTotalGb),
                    barColor = Color(0xFFA855F7)
                )
            }
        }

        // Quick Actions Section
        item {
            Text(
                text = stringResource(id = R.string.header_quick_actions),
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
                modifier = Modifier.padding(top = 8.dp, bottom = 2.dp)
            )
        }

        item {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(
                    onClick = onToggleServer,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (telemetry.isServerRunning) Color(0xFFDC2626) else Color(0xFF4F46E5)
                    )
                ) {
                    Text(
                        text = if (telemetry.isServerRunning) stringResource(id = R.string.btn_stop_rest_server) else stringResource(id = R.string.btn_start_rest_server),
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }

                OutlinedButton(
                    onClick = {
                        try {
                            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            context.startActivity(intent)
                        } catch (_: Exception) {}
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF38BDF8))
                ) {
                    Text(stringResource(id = R.string.btn_open_accessibility_settings), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
fun MetricGaugeCard(
    modifier: Modifier = Modifier,
    title: String,
    valueText: String,
    progress: Float,
    subText: String,
    barColor: Color
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(text = title, color = Color(0xFF94A3B8), fontSize = 12.sp)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = valueText, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))

            LinearProgressIndicator(
                progress = { progress.coerceIn(0f, 1f) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(6.dp),
                color = barColor,
                trackColor = Color(0xFF334155),
                strokeCap = androidx.compose.ui.graphics.StrokeCap.Round
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(text = subText, color = Color(0xFF64748B), fontSize = 11.sp)
        }
    }
}

@Composable
fun HardwareSpecsTabContent(detailedSpecs: List<HardwareSpecCategory>) {
    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(14.dp),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        items(detailedSpecs) { category ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = category.categoryName,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF38BDF8)
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    category.items.forEachIndexed { index, item ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(text = item.label, color = Color(0xFF94A3B8), fontSize = 12.sp, modifier = Modifier.weight(1f))
                            Text(text = item.value, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        }
                        if (index < category.items.size - 1) {
                            HorizontalDivider(color = Color(0xFF334155), modifier = Modifier.padding(vertical = 4.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun DiagnosticsTabContent(
    onRunOfflineCheckup: () -> Unit,
    onLaunchDisplayTest: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var uiTextResult by remember { mutableStateOf<com.robotrunner.companion.checkup.UiTextVerificationResult?>(null) }
    var generatedPdfFile by remember { mutableStateOf<java.io.File?>(null) }

    Column(
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
    ) {
        // POS & Hardware Diagnostics Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(stringResource(id = R.string.header_pos_hardware_checklist), color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    stringResource(id = R.string.desc_pos_checklist),
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.height(14.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = onRunOfflineCheckup,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))
                    ) {
                        Text(stringResource(id = R.string.btn_run_offline_pdf), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }

                    OutlinedButton(
                        onClick = {
                            val runner = com.robotrunner.companion.checkup.HardwareCheckupRunner(context)
                            val printed = runner.printTestReceipt()
                            if (printed) {
                                Toast.makeText(context, context.getString(R.string.msg_receipt_printed), Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, "POS Thermal printer unavailable or out of paper", Toast.LENGTH_SHORT).show()
                            }
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF38BDF8))
                    ) {
                        Text(stringResource(id = R.string.btn_print_test_receipt), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // UI Text Verification & Golden File Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(stringResource(id = R.string.header_ui_text_verification), color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    stringResource(id = R.string.desc_ui_text_verification),
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            uiTextResult = com.robotrunner.companion.checkup.UiTextVerifier.verifyActiveScreenText()
                            Toast.makeText(context, "Text Audit: ${uiTextResult?.matchPercentage}% match", Toast.LENGTH_SHORT).show()
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF22C55E)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(stringResource(id = R.string.btn_verify_ui_text), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = {
                            coroutineScope.launch {
                                val file = com.robotrunner.companion.checkup.UiTextVerifier.exportGoldenFileJson("Active Screen")
                                if (file != null) {
                                    Toast.makeText(context, context.getString(R.string.msg_golden_file_exported, file.name), Toast.LENGTH_LONG).show()
                                }
                            }
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(stringResource(id = R.string.btn_export_golden_json), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }

                uiTextResult?.let { res ->
                    Spacer(modifier = Modifier.height(12.dp))
                    Surface(
                        color = Color(0xFF0F172A),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(text = "Screen: ${res.screenName}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF38BDF8))
                            Text(text = "Match Score: ${res.matchPercentage}% (${res.totalMatched} / ${res.totalExpected})", fontSize = 12.sp, color = Color.White)
                            if (res.missingTexts.isNotEmpty()) {
                                Text(text = "Missing: ${res.missingTexts.take(3).joinToString(", ")}", fontSize = 10.5.sp, color = Color(0xFFEF4444))
                            }
                        }
                    }
                }
            }
        }

        // Technical Audit PDF Report Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(stringResource(id = R.string.header_pdf_audit_report), color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    stringResource(id = R.string.desc_pdf_audit_report),
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.height(14.dp))

                Button(
                    onClick = {
                        val checkupRunner = com.robotrunner.companion.checkup.HardwareCheckupRunner(context)
                        val checkupResult = checkupRunner.runLocalCheckup()
                        val pdfGen = com.robotrunner.companion.checkup.PdfReportGenerator(context)
                        val file = pdfGen.generatePdfReport(checkupResult, uiTextResult)
                        generatedPdfFile = file
                        if (file != null) {
                            Toast.makeText(context, context.getString(R.string.msg_pdf_report_generated, file.name), Toast.LENGTH_LONG).show()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(stringResource(id = R.string.btn_generate_pdf_audit), fontWeight = FontWeight.Bold)
                }

                generatedPdfFile?.let { pdfFile ->
                    Spacer(modifier = Modifier.height(10.dp))
                    OutlinedButton(
                        onClick = {
                            try {
                                val uri = androidx.core.content.FileProvider.getUriForFile(
                                    context,
                                    "${context.packageName}.fileprovider",
                                    pdfFile
                                )
                                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "application/pdf"
                                    putExtra(Intent.EXTRA_STREAM, uri)
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                context.startActivity(Intent.createChooser(shareIntent, "Share Technical Audit PDF Report"))
                            } catch (e: Exception) {
                                Toast.makeText(context, "Error opening PDF file: ${e.message}", Toast.LENGTH_SHORT).show()
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF38BDF8))
                    ) {
                        Text(stringResource(id = R.string.btn_share_pdf_report), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Display Test Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(stringResource(id = R.string.title_display_test), color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    stringResource(id = R.string.desc_display_test),
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.height(14.dp))
                OutlinedButton(
                    onClick = onLaunchDisplayTest,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF38BDF8))
                ) {
                    Text(stringResource(id = R.string.btn_launch_display_test), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

