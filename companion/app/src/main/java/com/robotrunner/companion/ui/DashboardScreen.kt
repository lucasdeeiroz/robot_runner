package com.robotrunner.companion.ui

import coil.compose.AsyncImage
import coil.ImageLoader
import coil.decode.SvgDecoder
import coil.request.ImageRequest

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.filled.AccountCircle
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Info

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
    
    var profileMenuExpanded by remember { mutableStateOf(false) }

    val context = LocalContext.current

    val themeState by com.robotrunner.companion.sync.ThemeSyncManager.themeState.collectAsState()
    
    val primaryColorVal = try {
        themeState.primaryColor?.let { Color(android.graphics.Color.parseColor(it)) } ?: Color(0xFF6366F1)
    } catch (e: Exception) { Color(0xFF6366F1) }

    val isDark = themeState.theme == "dark"
    val colorScheme = if (isDark) {
        darkColorScheme(
            primary = primaryColorVal,
            secondary = Color(0xFF38BDF8),
            surface = Color(0xFF0F172A),
            background = Color(0xFF090D16),
            surfaceVariant = Color(0xFF1E293B),
            onSurface = Color.White,
            onSurfaceVariant = Color(0xFF94A3B8)
        )
    } else {
        lightColorScheme(
            primary = primaryColorVal,
            secondary = Color(0xFF0284C7),
            surface = Color(0xFFF8FAFC),
            background = Color(0xFFF1F5F9),
            surfaceVariant = Color(0xFFE2E8F0),
            onSurface = Color(0xFF0F172A),
            onSurfaceVariant = Color(0xFF475569)
        )
    }

    MaterialTheme(
        colorScheme = colorScheme
    ) {
        Scaffold(
            bottomBar = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(colorScheme.surface)
                        .padding(horizontal = 20.dp, vertical = 8.dp)
                        .windowInsetsPadding(WindowInsets.navigationBars),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    when (currentSection) {
                        0 -> {
                            PillTabBar(
                                tabs = listOf(
                                    stringResource(id = R.string.tab_dashboard),
                                    stringResource(id = R.string.tab_hardware_specs),
                                    "Network"
                                ),
                                selectedIndex = subTabDashboard,
                                onTabSelected = { subTabDashboard = it }
                            )
                        }
                        1 -> {
                            PillTabBar(
                                tabs = listOf("UI Inspector", "Explorer", "BDD Runner"),
                                selectedIndex = subTabAutomation,
                                onTabSelected = { subTabAutomation = it }
                            )
                        }
                        2 -> {
                            PillTabBar(
                                tabs = listOf("Performance", "Stopwatch", "Logcat"),
                                selectedIndex = subTabPerf,
                                onTabSelected = { subTabPerf = it }
                            )
                        }
                        3 -> {
                            PillTabBar(
                                tabs = listOf("Apps", "Shell", stringResource(id = R.string.tab_diagnostics)),
                                selectedIndex = subTabTools,
                                onTabSelected = { subTabTools = it }
                            )
                        }
                        4 -> {
                            PillTabBar(
                                tabs = listOf(stringResource(id = R.string.tab_sync_center)),
                                selectedIndex = subTabSync,
                                onTabSelected = { subTabSync = it }
                            )
                        }
                    }
                }
            },
            topBar = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(colorScheme.surface)
                        .windowInsetsPadding(WindowInsets.statusBars)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (!themeState.logoBase64.isNullOrEmpty()) {
                                val imageLoader = remember(context) {
                                    ImageLoader.Builder(context)
                                        .components { add(SvgDecoder.Factory()) }
                                        .build()
                                }
                                    
                                val logoBytes = remember(themeState.logoBase64) {
                                    try {
                                        android.util.Base64.decode(themeState.logoBase64, android.util.Base64.DEFAULT)
                                    } catch (e: Exception) { null }
                                }

                                if (logoBytes != null) {
                                    AsyncImage(
                                        model = logoBytes,
                                        contentDescription = "Logo",
                                        imageLoader = imageLoader,
                                        modifier = Modifier.height(28.dp)
                                    )
                                }
                            } else {
                                Text(
                                    text = stringResource(id = R.string.app_name),
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = colorScheme.onSurface
                                )
                            }
                        }

                        Box {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier
                                    .background(colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
                                    .clip(RoundedCornerShape(16.dp))
                                    .clickable { profileMenuExpanded = true }
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                if (!themeState.userPhotoBase64.isNullOrEmpty()) {
                                    AsyncImage(
                                        model = themeState.userPhotoBase64,
                                        contentDescription = "User",
                                        modifier = Modifier
                                            .size(24.dp)
                                            .clip(CircleShape)
                                    )
                                } else {
                                    androidx.compose.material3.Icon(
                                        imageVector = Icons.Default.AccountCircle,
                                        contentDescription = "User",
                                        modifier = Modifier.size(24.dp),
                                        tint = colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            
                            MaterialTheme(
                                shapes = MaterialTheme.shapes.copy(extraSmall = RoundedCornerShape(16.dp))
                            ) {
                                DropdownMenu(
                                    expanded = profileMenuExpanded,
                                    onDismissRequest = { profileMenuExpanded = false },
                                    modifier = Modifier.background(colorScheme.surface)
                                ) {
                                    DropdownMenuItem(
                                    text = { Text("Configurações", color = colorScheme.onSurface) },
                                    leadingIcon = { 
                                        androidx.compose.material3.Icon(
                                            imageVector = Icons.Default.Settings,
                                            contentDescription = null,
                                            tint = colorScheme.onSurfaceVariant
                                        )
                                    },
                                    onClick = {
                                        currentSection = 3
                                        profileMenuExpanded = false
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text("Sobre", color = colorScheme.onSurface) },
                                    leadingIcon = { 
                                        androidx.compose.material3.Icon(
                                            imageVector = Icons.Default.Info,
                                            contentDescription = null,
                                            tint = colorScheme.onSurfaceVariant
                                        )
                                    },
                                    onClick = {
                                        currentSection = 4
                                        profileMenuExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }
                    
                    TabRow(
                        selectedTabIndex = if (currentSection > 2) -1 else currentSection,
                        containerColor = colorScheme.surface,
                        contentColor = primaryColorVal,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp, horizontal = 16.dp)
                            .clip(RoundedCornerShape(16.dp)),
                        divider = {},
                        indicator = {}
                    ) {
                        val tabs = listOf(
                            "Início" to Icons.Default.Home,
                            "Executar" to Icons.Default.PlayArrow,
                            "Testes" to Icons.Default.List
                        )
                        tabs.forEachIndexed { index, (label, icon) ->
                            Tab(
                                selected = currentSection == index,
                                onClick = { currentSection = index },
                                modifier = Modifier
                                    .padding(horizontal = 4.dp)
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(if (currentSection == index) primaryColorVal.copy(alpha = 0.15f) else Color.Transparent),
                                text = { 
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        androidx.compose.material3.Icon(
                                            imageVector = icon,
                                            contentDescription = label,
                                            modifier = Modifier.size(18.dp)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(label, fontSize = 13.sp, fontWeight = if (currentSection == index) FontWeight.Bold else FontWeight.Medium)
                                    }
                                },
                                selectedContentColor = primaryColorVal,
                                unselectedContentColor = colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .background(colorScheme.background)
            ) {


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
                        1 -> when (subTabAutomation) {
                            0 -> InspectorTabContent()
                            1 -> ExplorerTabContent()
                            2 -> BddTestRunnerTabContent()
                        }
                        2 -> when (subTabPerf) {
                            0 -> PerformanceTabContent()
                            1 -> StopwatchTabContent()
                            2 -> LogcatTabContent()
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
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
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
                        color = MaterialTheme.colorScheme.onSurfaceVariant
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
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = stringResource(id = R.string.label_accessibility),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "Grants sub-10ms UI tree inspection, click dispatching and autonomous exploration.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
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
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(text = title, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = value, fontSize = 20.sp, color = color, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(2.dp))
            Text(text = subtitle, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
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
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 12.sp
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = item.value,
                                    color = MaterialTheme.colorScheme.onSurface,
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
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 12.sp,
                                    modifier = Modifier.weight(1f, fill = false)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = item.value,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    textAlign = TextAlign.End
                                )
                            }
                        }

                        if (index < category.items.size - 1) {
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(vertical = 4.dp))
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
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(stringResource(id = R.string.header_pos_hardware_checklist), color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    "Comprehensive hardware diagnostic checklist for battery, memory, NFC and POS thermal printers.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
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
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(stringResource(id = R.string.header_ui_text_verification), color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    stringResource(id = R.string.desc_ui_text_verification),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text(text = "Screen: ${res.screenName}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF38BDF8))
                            Text(text = "Match Score: ${res.matchPercentage}% (${res.totalMatched} / ${res.totalExpected})", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface)
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
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(stringResource(id = R.string.header_pdf_audit_report), color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    stringResource(id = R.string.desc_pdf_audit_report),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
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
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text("Display & Color Calibration", color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    "Launch full screen RGB screen test to check for dead pixels and light bleeding.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
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

@Composable
fun PillTabBar(
    tabs: List<String>,
    selectedIndex: Int,
    onTabSelected: (Int) -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    val primaryColorVal = Color(0xFF10B981) // emerald-500 matching Desktop TabBar

    ScrollableTabRow(
        selectedTabIndex = selectedIndex,
        containerColor = colorScheme.surfaceVariant.copy(alpha = 0.3f),
        contentColor = primaryColorVal,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, colorScheme.outlineVariant.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .padding(4.dp),
        edgePadding = 0.dp,
        divider = {},
        indicator = {}
    ) {
        tabs.forEachIndexed { index, label ->
            Tab(
                selected = selectedIndex == index,
                onClick = { onTabSelected(index) },
                modifier = Modifier
                    .padding(horizontal = 4.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (selectedIndex == index) primaryColorVal.copy(alpha = 0.15f) else Color.Transparent),
                text = {
                    Text(
                        text = label,
                        fontSize = 12.sp,
                        fontWeight = if (selectedIndex == index) FontWeight.Bold else FontWeight.Medium
                    )
                },
                selectedContentColor = primaryColorVal,
                unselectedContentColor = colorScheme.onSurfaceVariant
            )
        }
    }
}
