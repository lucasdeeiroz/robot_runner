package com.robotrunner.companion.ui

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
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
import kotlinx.coroutines.launch

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
    var currentSection by remember { mutableIntStateOf(0) } // 0: Dashboard, 1: Perf, 2: Automation, 3: Tools, 4: Sync
    var subTabDashboard by remember { mutableIntStateOf(0) }
    var subTabPerf by remember { mutableIntStateOf(0) }
    var subTabAutomation by remember { mutableIntStateOf(0) }
    var subTabTools by remember { mutableIntStateOf(0) }
    var subTabSync by remember { mutableIntStateOf(0) }

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
        Scaffold(
            bottomBar = {
                NavigationBar(
                    containerColor = Color(0xFF0F172A),
                    contentColor = Color.White
                ) {
                    NavigationBarItem(
                        selected = currentSection == 0,
                        onClick = { currentSection = 0 },
                        icon = { Text("📊", fontSize = 16.sp) },
                        label = { Text(stringResource(id = R.string.nav_dashboard), fontSize = 10.sp, maxLines = 1) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color(0xFF38BDF8),
                            selectedTextColor = Color(0xFF38BDF8),
                            indicatorColor = Color(0xFF1E293B),
                            unselectedIconColor = Color(0xFF64748B),
                            unselectedTextColor = Color(0xFF64748B)
                        )
                    )
                    NavigationBarItem(
                        selected = currentSection == 1,
                        onClick = { currentSection = 1 },
                        icon = { Text("⚡", fontSize = 16.sp) },
                        label = { Text(stringResource(id = R.string.nav_performance), fontSize = 10.sp, maxLines = 1) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color(0xFF38BDF8),
                            selectedTextColor = Color(0xFF38BDF8),
                            indicatorColor = Color(0xFF1E293B),
                            unselectedIconColor = Color(0xFF64748B),
                            unselectedTextColor = Color(0xFF64748B)
                        )
                    )
                    NavigationBarItem(
                        selected = currentSection == 2,
                        onClick = { currentSection = 2 },
                        icon = { Text("🧪", fontSize = 16.sp) },
                        label = { Text(stringResource(id = R.string.nav_automation), fontSize = 10.sp, maxLines = 1) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color(0xFF38BDF8),
                            selectedTextColor = Color(0xFF38BDF8),
                            indicatorColor = Color(0xFF1E293B),
                            unselectedIconColor = Color(0xFF64748B),
                            unselectedTextColor = Color(0xFF64748B)
                        )
                    )
                    NavigationBarItem(
                        selected = currentSection == 3,
                        onClick = { currentSection = 3 },
                        icon = { Text("🛠️", fontSize = 16.sp) },
                        label = { Text(stringResource(id = R.string.nav_tools), fontSize = 10.sp, maxLines = 1) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color(0xFF38BDF8),
                            selectedTextColor = Color(0xFF38BDF8),
                            indicatorColor = Color(0xFF1E293B),
                            unselectedIconColor = Color(0xFF64748B),
                            unselectedTextColor = Color(0xFF64748B)
                        )
                    )
                    NavigationBarItem(
                        selected = currentSection == 4,
                        onClick = { currentSection = 4 },
                        icon = { Text("🔄", fontSize = 16.sp) },
                        label = { Text(stringResource(id = R.string.nav_sync), fontSize = 10.sp, maxLines = 1) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = Color(0xFF38BDF8),
                            selectedTextColor = Color(0xFF38BDF8),
                            indicatorColor = Color(0xFF1E293B),
                            unselectedIconColor = Color(0xFF64748B),
                            unselectedTextColor = Color(0xFF64748B)
                        )
                    )
                }
            }
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .background(Color(0xFF090D16))
            ) {
                // Header Banner
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color(0xFF0F172A))
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = stringResource(id = R.string.app_name),
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = stringResource(id = R.string.subtitle_agent),
                        fontSize = 11.sp,
                        color = Color(0xFF94A3B8)
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    // Top Sub-Tab Row Scoped to Current Bottom Section
                    when (currentSection) {
                        0 -> {
                            TabRow(
                                selectedTabIndex = subTabDashboard,
                                containerColor = Color(0xFF1E293B),
                                contentColor = Color(0xFF38BDF8),
                                modifier = Modifier.height(40.dp)
                            ) {
                                Tab(selected = subTabDashboard == 0, onClick = { subTabDashboard = 0 }) {
                                    Text(stringResource(id = R.string.tab_dashboard), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                                Tab(selected = subTabDashboard == 1, onClick = { subTabDashboard = 1 }) {
                                    Text(stringResource(id = R.string.tab_hardware_specs), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                                Tab(selected = subTabDashboard == 2, onClick = { subTabDashboard = 2 }) {
                                    Text("Network", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                        1 -> {
                            TabRow(
                                selectedTabIndex = subTabPerf,
                                containerColor = Color(0xFF1E293B),
                                contentColor = Color(0xFF38BDF8),
                                modifier = Modifier.height(40.dp)
                            ) {
                                Tab(selected = subTabPerf == 0, onClick = { subTabPerf = 0 }) {
                                    Text("Performance", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                                Tab(selected = subTabPerf == 1, onClick = { subTabPerf = 1 }) {
                                    Text("Stopwatch", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                                Tab(selected = subTabPerf == 2, onClick = { subTabPerf = 2 }) {
                                    Text("Logcat", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                        2 -> {
                            TabRow(
                                selectedTabIndex = subTabAutomation,
                                containerColor = Color(0xFF1E293B),
                                contentColor = Color(0xFF38BDF8),
                                modifier = Modifier.height(40.dp)
                            ) {
                                Tab(selected = subTabAutomation == 0, onClick = { subTabAutomation = 0 }) {
                                    Text("UI Inspector", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                                Tab(selected = subTabAutomation == 1, onClick = { subTabAutomation = 1 }) {
                                    Text("Explorer", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                                Tab(selected = subTabAutomation == 2, onClick = { subTabAutomation = 2 }) {
                                    Text("BDD Runner", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                        3 -> {
                            TabRow(
                                selectedTabIndex = subTabTools,
                                containerColor = Color(0xFF1E293B),
                                contentColor = Color(0xFF38BDF8),
                                modifier = Modifier.height(40.dp)
                            ) {
                                Tab(selected = subTabTools == 0, onClick = { subTabTools = 0 }) {
                                    Text("Apps", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                                Tab(selected = subTabTools == 1, onClick = { subTabTools = 1 }) {
                                    Text("Shell", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                                Tab(selected = subTabTools == 2, onClick = { subTabTools = 2 }) {
                                    Text(stringResource(id = R.string.tab_diagnostics), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                        4 -> {
                            TabRow(
                                selectedTabIndex = subTabSync,
                                containerColor = Color(0xFF1E293B),
                                contentColor = Color(0xFF38BDF8),
                                modifier = Modifier.height(40.dp)
                            ) {
                                Tab(selected = subTabSync == 0, onClick = { subTabSync = 0 }) {
                                    Text(stringResource(id = R.string.tab_sync_center), fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }
                }

                // Active Sub-Tab View Content
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    when (currentSection) {
                        0 -> when (subTabDashboard) {
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
                        }
                        1 -> when (subTabPerf) {
                            0 -> PerformanceTabContent()
                            1 -> StopwatchTabContent()
                            2 -> LogcatTabContent()
                        }
                        2 -> when (subTabAutomation) {
                            0 -> InspectorTabContent()
                            1 -> ExplorerTabContent()
                            2 -> BddTestRunnerTabContent()
                        }
                        3 -> when (subTabTools) {
                            0 -> PackageManagerTabContent()
                            1 -> ShellConsoleTabContent()
                            2 -> DiagnosticsTabContent(
                                onRunOfflineCheckup = onRunOfflineCheckup,
                                onLaunchDisplayTest = onLaunchDisplayTest
                            )
                        }
                        4 -> when (subTabSync) {
                            0 -> SyncCenterTabContent()
                        }
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
    Column(
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp)
    ) {
        // Status Bar Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = if (telemetry.isServerRunning) stringResource(id = R.string.status_port_active, port) else stringResource(id = R.string.status_server_offline),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (telemetry.isServerRunning) Color(0xFF10B981) else Color(0xFFEF4444)
                    )
                    Text(
                        text = if (telemetry.isServerRunning) "IP: $ipAddress:$port" else stringResource(id = R.string.subtext_tap_start),
                        fontSize = 12.sp,
                        color = Color(0xFF94A3B8)
                    )
                }

                Button(
                    onClick = onToggleServer,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (telemetry.isServerRunning) Color(0xFFEF4444) else Color(0xFF6366F1)
                    )
                ) {
                    Text(
                        text = if (telemetry.isServerRunning) stringResource(id = R.string.btn_stop_rest_server) else stringResource(id = R.string.btn_start_rest_server),
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp
                    )
                }
            }
        }

        // Live Telemetry Gauges Grid
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            GaugeCard(
                title = stringResource(id = R.string.gauge_cpu_title),
                value = "${telemetry.cpuUsagePercent}%",
                subtitle = stringResource(id = R.string.gauge_cpu_sub),
                color = Color(0xFF38BDF8),
                modifier = Modifier.weight(1f)
            )
            GaugeCard(
                title = stringResource(id = R.string.gauge_ram_title),
                value = "${telemetry.ramPercent}%",
                subtitle = "${telemetry.ramUsedMb}/${telemetry.ramTotalMb} MB",
                color = Color(0xFF10B981),
                modifier = Modifier.weight(1f)
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            GaugeCard(
                title = stringResource(id = R.string.gauge_battery_title),
                value = "${telemetry.batteryTempC}°C",
                subtitle = "${telemetry.batteryPercent}% • ${if (telemetry.isCharging) "Charging" else "Discharging"}",
                color = Color(0xFFF59E0B),
                modifier = Modifier.weight(1f)
            )
            GaugeCard(
                title = stringResource(id = R.string.gauge_storage_title),
                value = "${telemetry.storagePercent}%",
                subtitle = "${telemetry.storageUsedGb}/${telemetry.storageTotalGb} GB",
                color = Color(0xFFA855F7),
                modifier = Modifier.weight(1f)
            )
        }

        // Accessibility Service Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = stringResource(id = R.string.label_accessibility),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Grants sub-10ms UI tree inspection, click dispatching and autonomous exploration.",
                    fontSize = 12.sp,
                    color = Color(0xFF94A3B8)
                )
                Spacer(modifier = Modifier.height(14.dp))

                OutlinedButton(
                    onClick = {
                        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                        context.startActivity(intent)
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF38BDF8))
                ) {
                    Text(
                        text = stringResource(id = R.string.btn_open_accessibility_settings),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
fun GaugeCard(
    title: String,
    value: String,
    subtitle: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(text = title, fontSize = 11.sp, color = Color(0xFF94A3B8), fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = value, fontSize = 20.sp, color = color, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(2.dp))
            Text(text = subtitle, fontSize = 10.sp, color = Color(0xFF64748B))
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
                        // Heuristic: if combined text is long, stack vertically
                        val shouldStack = (item.label.length + item.value.length) > 45

                        if (shouldStack) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                            ) {
                                Text(
                                    text = item.label,
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = item.value,
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.fillMaxWidth(),
                                    textAlign = TextAlign.End
                                )
                            }
                        } else {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = item.label,
                                    color = Color(0xFF94A3B8),
                                    fontSize = 12.sp,
                                    modifier = Modifier.weight(1f, fill = false)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    text = item.value,
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
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
            .padding(bottom = 24.dp)
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
                    "Comprehensive hardware diagnostic checklist for battery, memory, NFC and POS thermal printers.",
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
                        Text(stringResource(id = R.string.btn_offline_checkup), fontSize = 11.sp, fontWeight = FontWeight.Bold)
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
                Text("Display & Color Calibration", color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    "Launch full screen RGB screen test to check for dead pixels and light bleeding.",
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
                    Text("Launch Full Screen Display Test", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}
