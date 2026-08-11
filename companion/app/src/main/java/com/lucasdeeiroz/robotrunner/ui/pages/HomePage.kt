package com.lucasdeeiroz.robotrunner.ui.pages

import coil.compose.AsyncImage
import coil.ImageLoader
import coil.decode.SvgDecoder
import coil.request.ImageRequest

import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.rounded.*
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
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
import com.lucasdeeiroz.robotrunner.ui.components.tabs.home.HomeSubTab
import com.lucasdeeiroz.robotrunner.ui.components.tabs.home.ConnectSubTab
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lucasdeeiroz.robotrunner.R
import com.lucasdeeiroz.robotrunner.apps.PackageManagerTabContent
import com.lucasdeeiroz.robotrunner.bdd.BddTestRunnerTabContent
import com.lucasdeeiroz.robotrunner.explorer.ExplorerTabContent
import com.lucasdeeiroz.robotrunner.inspector.InspectorTabContent
import com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox.LogcatSubTab
import com.lucasdeeiroz.robotrunner.model.HardwareSpecCategory
import com.lucasdeeiroz.robotrunner.model.LiveTelemetry
import com.lucasdeeiroz.robotrunner.ui.components.tabs.home.ConnectSubTab
import com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox.PerformanceSubTab
import com.lucasdeeiroz.robotrunner.shell.ShellConsoleTabContent
import com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox.StopwatchSubTab
import kotlinx.coroutines.launch
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.PlayArrow

import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Build
import com.lucasdeeiroz.robotrunner.ui.theme.RobotRunnerTheme
import com.lucasdeeiroz.robotrunner.ui.components.glassmorphicBackground

@Composable
fun PlaceholderTabContent(title: String) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        androidx.compose.material3.Icon(
            imageVector = Icons.Default.Info,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = stringResource(id = R.string.msg_coming_soon, title),
            fontSize = 18.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = stringResource(id = R.string.msg_feature_unavailable),
            fontSize = 14.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 32.dp)
        )
    }
}


@Composable
fun HomePage(
    isServerRunning: Boolean,
    telemetry: LiveTelemetry,
    detailedSpecs: List<HardwareSpecCategory>,
    ipAddress: String,
    port: Int,
    onToggleServer: () -> Unit,
    onRunOfflineCheckup: () -> Unit,
    onLaunchDisplayTest: () -> Unit
) {
    var currentSection by remember { mutableIntStateOf(0) } // 0: Home, 1: Run, 2: Toolbox
    var subTabHome by remember { mutableIntStateOf(0) } // 0: Dashboard, 1: Connect, 2: Network
    var subTabRun by remember { mutableIntStateOf(0) } // 0: Launcher, 1: Inspector, 2: Mapper, 3: Scenarios
    var subTabToolbox by remember { mutableIntStateOf(0) } // 0: Logcat, 1: Perf, 2: Stopwatch, 3: Shell, 4: Apps, 5: Hardware, 6: Checkup, 7: Console, 8: Webview, 9: History
    
    var profileMenuExpanded by remember { mutableStateOf(false) }

    val context = LocalContext.current

    val themeState by com.lucasdeeiroz.robotrunner.sync.ThemeSyncManager.themeState.collectAsState()
    
    val primaryColorVal = try {
        themeState.primaryColor?.let { colorStr ->
            when (colorStr.lowercase()) {
                "blue" -> Color(0xFF4338CA)
                "red" -> Color(0xFFE11D48)
                "green" -> Color(0xFF059669)
                "purple" -> Color(0xFF7C3AED)
                "orange" -> Color(0xFFD97706)
                "cyan" -> Color(0xFF0D9488)
                "pink" -> Color(0xFFBE123C)
                else -> Color(android.graphics.Color.parseColor(colorStr))
            }
        } ?: Color(0xFF6366F1)
    } catch (e: Exception) { Color(0xFF6366F1) }

    RobotRunnerTheme(
        darkTheme = themeState.theme == "dark",
        dynamicPrimaryColor = primaryColorVal
    ) {
        val colorScheme = MaterialTheme.colorScheme
        Scaffold(
            bottomBar = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 8.dp)
                        .windowInsetsPadding(WindowInsets.navigationBars),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    when (currentSection) {
                        0 -> {
                            PillTabBar(
                                tabs = listOf(
                                    PillTabItem(stringResource(id = R.string.tab_dashboard), Icons.Rounded.Dashboard),
                                    PillTabItem(stringResource(id = R.string.tab_connect), Icons.Rounded.Wifi)
                                ),
                                selectedIndex = subTabHome,
                                onTabSelected = { subTabHome = it }
                            )
                        }
                        1 -> {
                            PillTabBar(
                                tabs = listOf(
                                    PillTabItem(stringResource(id = R.string.tab_bdd_runner), Icons.Rounded.PlayArrow),
                                    PillTabItem(stringResource(id = R.string.tab_ui_inspector), Icons.Rounded.Search),
                                    PillTabItem(stringResource(id = R.string.tab_explorer), Icons.Rounded.Explore),
                                    // PillTabItem(stringResource(id = R.string.tab_scenarios), Icons.AutoMirrored.Rounded.List)
                                ),
                                selectedIndex = subTabRun,
                                onTabSelected = { subTabRun = it }
                            )
                        }
                        2 -> {
                            PillTabBar(
                                tabs = listOf(
                                    PillTabItem(stringResource(id = R.string.tab_logcat), Icons.Rounded.FormatAlignLeft),
                                    PillTabItem(stringResource(id = R.string.tab_performance), Icons.Rounded.Speed),
                                    PillTabItem(stringResource(id = R.string.tab_stopwatch), Icons.Rounded.Timer),
                                    PillTabItem(stringResource(id = R.string.tab_shell), Icons.Rounded.Terminal),
                                    PillTabItem(stringResource(id = R.string.tab_apps), Icons.Rounded.Apps),
                                    PillTabItem(stringResource(id = R.string.tab_hardware_specs), Icons.Rounded.Memory),
                                    PillTabItem(stringResource(id = R.string.tab_diagnostics), Icons.Rounded.Build),
                                    // PillTabItem(stringResource(id = R.string.tab_webview), Icons.Rounded.Language),
                                    PillTabItem(stringResource(id = R.string.tab_run_console), Icons.Rounded.Code),
                                    PillTabItem(stringResource(id = R.string.tab_history), Icons.Rounded.History)
                                ),
                                selectedIndex = subTabToolbox,
                                onTabSelected = { subTabToolbox = it }
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
                                        contentDescription = stringResource(id = R.string.desc_logo),
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
                                        contentDescription = stringResource(id = R.string.desc_user_avatar),
                                        modifier = Modifier
                                            .size(24.dp)
                                            .clip(CircleShape)
                                    )
                                } else {
                                    androidx.compose.material3.Icon(
                                        imageVector = Icons.Default.AccountCircle,
                                        contentDescription = stringResource(id = R.string.desc_user_avatar),
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
                                    text = { Text(stringResource(id = R.string.menu_settings), color = colorScheme.onSurface) },
                                    leadingIcon = { 
                                        androidx.compose.material3.Icon(
                                            imageVector = Icons.Default.Settings,
                                            contentDescription = null,
                                            tint = colorScheme.onSurfaceVariant
                                        )
                                    },
                                    onClick = {
                                        Toast.makeText(context, context.getString(R.string.msg_settings_soon), Toast.LENGTH_SHORT).show()
                                        profileMenuExpanded = false
                                    }
                                )
                                DropdownMenuItem(
                                    text = { Text(stringResource(id = R.string.menu_about), color = colorScheme.onSurface) },
                                    leadingIcon = { 
                                        androidx.compose.material3.Icon(
                                            imageVector = Icons.Default.Info,
                                            contentDescription = null,
                                            tint = colorScheme.onSurfaceVariant
                                        )
                                    },
                                    onClick = {
                                        Toast.makeText(context, context.getString(R.string.msg_about_soon), Toast.LENGTH_SHORT).show()
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
                        contentColor = MaterialTheme.colorScheme.primary,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp, horizontal = 16.dp)
                            .clip(RoundedCornerShape(16.dp)),
                        divider = {},
                        indicator = {}
                    ) {
                        val tabs = listOf(
                            stringResource(id = R.string.tab_main_home) to Icons.Default.Home,
                            stringResource(id = R.string.tab_main_run) to Icons.Default.PlayArrow,
                            stringResource(id = R.string.tab_main_tests) to Icons.AutoMirrored.Rounded.List
                        )
                        tabs.forEachIndexed { index, (label, icon) ->
                            Tab(
                                selected = currentSection == index,
                                onClick = { currentSection = index },
                                modifier = Modifier
                                    .padding(horizontal = 4.dp)
                                    .clip(RoundedCornerShape(16.dp))
                                    .background(if (currentSection == index) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f) else Color.Transparent),
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
                                selectedContentColor = MaterialTheme.colorScheme.primary,
                                unselectedContentColor = colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        ) { paddingValues ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(
                        top = paddingValues.calculateTopPadding(),
                        bottom = 0.dp
                    )
                    .background(MaterialTheme.colorScheme.surface)
            ) {


                // Active Sub-Tab View Content
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    when (currentSection) {
                        0 -> when (subTabHome) {
                            0 -> HomeSubTab(
                                isServerRunning = isServerRunning,
                                telemetry = telemetry,
                                ipAddress = ipAddress,
                                port = port,
                                onToggleServer = onToggleServer,
                                context = context
                            )
                            
                            1 -> ConnectSubTab(
                                ipAddress = ipAddress,
                                port = port,
                                isServerRunning = telemetry.isServerRunning,
                                activeClients = telemetry.activeClientsCount,
                                onToggleServer = onToggleServer
                            )
                        }
                        1 -> when (subTabRun) {
                            0 -> BddTestRunnerTabContent()
                            1 -> InspectorTabContent()
                            2 -> ExplorerTabContent()
                            3 -> PlaceholderTabContent(stringResource(id = R.string.tab_scenarios_ai))
                        }
                        2 -> when (subTabToolbox) {
                            0 -> LogcatSubTab()
                            1 -> PerformanceSubTab()
                            2 -> StopwatchSubTab()
                            3 -> ShellConsoleTabContent()
                            4 -> PackageManagerTabContent()
                            5 -> HardwareSpecsTabContent(detailedSpecs = detailedSpecs)
                            6 -> DiagnosticsTabContent(
                                onRunOfflineCheckup = onRunOfflineCheckup,
                                onLaunchDisplayTest = onLaunchDisplayTest
                            )
                            7 -> PlaceholderTabContent(stringResource(id = R.string.tab_run_console))
                            8 -> PlaceholderTabContent(stringResource(id = R.string.tab_history))
                            // 9 -> PlaceholderTabContent(stringResource(id = R.string.tab_webview))
                        }
                    }
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
    var uiTextResult by remember { mutableStateOf<com.lucasdeeiroz.robotrunner.checkup.UiTextVerificationResult?>(null) }
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
                    stringResource(id = R.string.desc_hardware_diagnostic),
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
                            val runner = com.lucasdeeiroz.robotrunner.checkup.HardwareCheckupRunner(context)
                            val printed = runner.printTestReceipt()
                            if (printed) {
                                Toast.makeText(context, context.getString(R.string.msg_receipt_printed), Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, context.getString(R.string.msg_pos_printer_unavailable), Toast.LENGTH_SHORT).show()
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
                            uiTextResult = com.lucasdeeiroz.robotrunner.checkup.UiTextVerifier.verifyActiveScreenText()
                            Toast.makeText(context, context.getString(R.string.text_audit_match, uiTextResult?.matchPercentage ?: 0), Toast.LENGTH_SHORT).show()
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
                                val file = com.lucasdeeiroz.robotrunner.checkup.UiTextVerifier.exportGoldenFileJson("Active Screen")
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
                            Text(text = stringResource(id = R.string.label_screen_name, res.screenName), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF38BDF8))
                            Text(text = stringResource(id = R.string.label_match_score, res.matchPercentage, res.totalMatched, res.totalExpected), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface)
                            if (res.missingTexts.isNotEmpty()) {
                                Text(text = stringResource(id = R.string.label_missing_texts, res.missingTexts.take(3).joinToString(", ")), fontSize = 10.5.sp, color = Color(0xFFEF4444))
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
                        val checkupRunner = com.lucasdeeiroz.robotrunner.checkup.HardwareCheckupRunner(context)
                        val checkupResult = checkupRunner.runLocalCheckup()
                        val pdfGen = com.lucasdeeiroz.robotrunner.checkup.PdfReportGenerator(context)
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
                                context.startActivity(Intent.createChooser(shareIntent, context.getString(R.string.btn_share_audit_pdf)))
                            } catch (e: Exception) {
                                Toast.makeText(context, context.getString(R.string.msg_error_opening_pdf, e.message ?: ""), Toast.LENGTH_SHORT).show()
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
                Text(stringResource(id = R.string.header_display_calibration), color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    stringResource(id = R.string.desc_display_calibration),
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
                    Text(stringResource(id = R.string.btn_launch_display_test), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

data class PillTabItem(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

@Composable
fun PillTabBar(
    tabs: List<PillTabItem>,
    selectedIndex: Int,
    onTabSelected: (Int) -> Unit
) {
    val colorScheme = MaterialTheme.colorScheme
    val primaryColorVal = MaterialTheme.colorScheme.primary // match active theme primary color

    Row(
        modifier = Modifier
            .glassmorphicBackground(colorScheme.surfaceVariant, RoundedCornerShape(16.dp))
            .border(1.dp, colorScheme.outlineVariant.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
            .clip(RoundedCornerShape(16.dp))
            .padding(4.dp)
            .horizontalScroll(androidx.compose.foundation.rememberScrollState()),
        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        tabs.forEachIndexed { index, tabItem ->
            Tab(
                selected = selectedIndex == index,
                onClick = { onTabSelected(index) },
                modifier = Modifier
                    .padding(horizontal = 4.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (selectedIndex == index) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f) else Color.Transparent),
                text = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = tabItem.icon,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = tabItem.label,
                            fontSize = 12.sp,
                            fontWeight = if (selectedIndex == index) FontWeight.Bold else FontWeight.Medium
                        )
                    }
                },
                selectedContentColor = MaterialTheme.colorScheme.primary,
                unselectedContentColor = colorScheme.onSurfaceVariant
            )
        }
    }
}
