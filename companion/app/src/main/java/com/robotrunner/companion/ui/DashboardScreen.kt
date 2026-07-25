package com.robotrunner.companion.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import com.robotrunner.companion.logcat.LogcatTabContent
import com.robotrunner.companion.model.HardwareSpecCategory
import com.robotrunner.companion.model.LiveTelemetry
import com.robotrunner.companion.net.NetworkTabContent
import com.robotrunner.companion.performance.PerformanceTabContent
import com.robotrunner.companion.shell.ShellConsoleTabContent
import com.robotrunner.companion.stopwatch.StopwatchTabContent

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
                            selected = selectedTab == 5,
                            onClick = { selectedTab = 5 },
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
                            selected = selectedTab == 6,
                            onClick = { selectedTab = 6 },
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
                            selected = selectedTab == 7,
                            onClick = { selectedTab = 7 },
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
                            selected = selectedTab == 8,
                            onClick = { selectedTab = 8 },
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
                        4 -> LogcatTabContent()
                        5 -> PerformanceTabContent()
                        6 -> PackageManagerTabContent()
                        7 -> ShellConsoleTabContent()
                        8 -> DiagnosticsTabContent(
                            onRunOfflineCheckup = onRunOfflineCheckup,
                            onLaunchDisplayTest = onLaunchDisplayTest
                        )
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
    Column(
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(stringResource(id = R.string.title_pos_checklist), color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    stringResource(id = R.string.desc_pos_checklist),
                    color = Color(0xFF94A3B8),
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.height(14.dp))
                Button(
                    onClick = onRunOfflineCheckup,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))
                ) {
                    Text(stringResource(id = R.string.btn_run_offline_pdf), fontWeight = FontWeight.Bold)
                }
            }
        }

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

