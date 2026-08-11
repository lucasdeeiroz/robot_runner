package com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.lucasdeeiroz.robotrunner.R
import com.lucasdeeiroz.robotrunner.performance.FloatingHudService
import com.lucasdeeiroz.robotrunner.service.CompanionAccessibilityService
import com.lucasdeeiroz.robotrunner.stopwatch.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class StopwatchMode { LOGCAT, SCANNER }

@Composable
fun StopwatchSubTab() {
    var currentMode by remember { mutableStateOf(StopwatchMode.LOGCAT) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Mode Selector
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.Center
        ) {
            // ModeTab(
            //     title = stringResource(id = R.string.mode_redraw),
            //     isSelected = currentMode == StopwatchMode.REDRAW,
            //     onClick = { currentMode = StopwatchMode.REDRAW }
            // )
            Spacer(modifier = Modifier.width(8.dp))
            ModeTab(
                title = stringResource(id = R.string.mode_logcat),
                isSelected = currentMode == StopwatchMode.LOGCAT,
                onClick = { currentMode = StopwatchMode.LOGCAT }
            )
            Spacer(modifier = Modifier.width(8.dp))
            ModeTab(
                title = stringResource(id = R.string.mode_scanner),
                isSelected = currentMode == StopwatchMode.SCANNER,
                onClick = { currentMode = StopwatchMode.SCANNER }
            )
        }

        when (currentMode) {
            // StopwatchMode.REDRAW -> RedrawStopwatchContent()
            StopwatchMode.LOGCAT -> LogcatStopwatchContent()
            StopwatchMode.SCANNER -> ScannerStopwatchContent()
        }
    }
}

@Composable
fun ModeTab(title: String, isSelected: Boolean, onClick: () -> Unit) {
    val bgColor = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
    val contentColor =
        if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        color = bgColor,
        shape = RoundedCornerShape(20.dp),
        modifier = Modifier
            .clickable { onClick() }
            .padding(vertical = 4.dp)
    ) {
        Text(
            text = title,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = contentColor
        )
    }
}

@Composable
fun RedrawStopwatchContent() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var lastDeltaMs by remember { mutableLongStateOf(0L) }
    var activePackage by remember { mutableStateOf("") }
    var isRecording by remember { mutableStateOf(RedrawStopwatchEngine.isRecordingSession) }
    var currentSession by remember { mutableStateOf<BenchmarkSession?>(null) }
    var laps by remember { mutableStateOf<List<RedrawLap>>(emptyList()) }
    var isHudRunning by remember { mutableStateOf(com.lucasdeeiroz.robotrunner.overlay.StopwatchOverlayService.isRunning) }

    LaunchedEffect(Unit) {
        while (true) {
            isHudRunning = com.lucasdeeiroz.robotrunner.overlay.StopwatchOverlayService.isRunning
            lastDeltaMs = CompanionAccessibilityService.lastFrameRedrawDeltaMs
            activePackage = CompanionAccessibilityService.activePackageName ?: "unknown"
            laps = RedrawStopwatchEngine.getLapsSnapshot()

            if (isRecording && lastDeltaMs > 0) {
                val touchTs = CompanionAccessibilityService.lastTouchTimestamp
                val redrawTs = CompanionAccessibilityService.lastRedrawTimestamp
                if (touchTs > 0 && redrawTs > touchTs) {
                    val lastRecorded = laps.lastOrNull()
                    if (lastRecorded == null || lastRecorded.redrawTimestamp != redrawTs) {
                        RedrawStopwatchEngine.recordLap(
                            touchTimestamp = touchTs,
                            redrawTimestamp = redrawTs,
                            deltaMs = lastDeltaMs,
                            packageName = activePackage
                        )
                    }
                }
            }
            delay(200)
        }
    }

    val deltaStatusColor = when {
        lastDeltaMs <= 0 -> MaterialTheme.colorScheme.onSurfaceVariant
        lastDeltaMs < 50 -> MaterialTheme.colorScheme.primary
        lastDeltaMs < 200 -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.error
    }

    val deltaStatusText = when {
        lastDeltaMs <= 0 -> stringResource(id = R.string.status_standby)
        lastDeltaMs < 50 -> stringResource(id = R.string.status_fast_ui)
        lastDeltaMs < 200 -> stringResource(id = R.string.status_normal_ui)
        else -> stringResource(id = R.string.status_slow_ui)
    }

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(id = R.string.header_floating_hud_stopwatch),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = stringResource(id = R.string.desc_floating_hud_stopwatch),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Button(
                    onClick = {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
                            val intent = Intent(
                                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:${context.packageName}")
                            ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                            context.startActivity(intent)
                            Toast.makeText(
                                context,
                                context.getString(R.string.msg_grant_overlay_permission),
                                Toast.LENGTH_LONG
                            ).show()
                        } else {
                            val serviceIntent = Intent(
                                context,
                                com.lucasdeeiroz.robotrunner.overlay.StopwatchOverlayService::class.java
                            )
                            if (isHudRunning) {
                                context.stopService(serviceIntent)
                                isHudRunning = false
                            } else {
                                context.startService(serviceIntent)
                                isHudRunning = true
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isHudRunning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = if (isHudRunning) stringResource(id = R.string.btn_stop_hud) else stringResource(id = R.string.btn_start_hud),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(id = R.string.header_redraw_stopwatch),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = stringResource(id = R.string.desc_redraw_stopwatch),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "${lastDeltaMs} ms",
                    fontSize = 42.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = deltaStatusColor
                )

                Text(
                    text = deltaStatusText,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = deltaStatusColor,
                    modifier = Modifier.padding(top = 8.dp)
                )

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = stringResource(id = R.string.msg_use_hud_for_redraw),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 8.dp)
                )
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            if (isRecording) {
                                currentSession = RedrawStopwatchEngine.stopSession()
                                isRecording = false
                            } else {
                                RedrawStopwatchEngine.startSession()
                                isRecording = true
                                currentSession = null
                            }
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isRecording) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = if (isRecording) stringResource(id = R.string.btn_stop_benchmark) else stringResource(
                                id = R.string.btn_start_benchmark
                            ),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Button(
                        onClick = {
                            val now = System.currentTimeMillis()
                            val touchTs =
                                if (CompanionAccessibilityService.lastTouchTimestamp > 0) CompanionAccessibilityService.lastTouchTimestamp else now - lastDeltaMs
                            RedrawStopwatchEngine.recordLap(
                                touchTimestamp = touchTs,
                                redrawTimestamp = now,
                                deltaMs = if (lastDeltaMs > 0) lastDeltaMs else 16L,
                                packageName = activePackage,
                                actionType = "manual_split"
                            )
                        },
                        enabled = isRecording,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.outlineVariant),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(text = stringResource(id = R.string.btn_manual_lap), fontSize = 12.sp)
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                Button(
                    onClick = {
                        coroutineScope.launch {
                            val file = RedrawStopwatchEngine.exportSessionJson()
                            if (file != null) {
                                Toast.makeText(
                                    context,
                                    context.getString(R.string.msg_benchmark_exported, file.name),
                                    Toast.LENGTH_LONG
                                ).show()
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = stringResource(id = R.string.btn_export_benchmark),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        currentSession?.let { sess ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StatCard(
                    label = stringResource(id = R.string.label_min_delta),
                    value = "${sess.minDeltaMs} ms",
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    label = stringResource(id = R.string.label_avg_delta),
                    value = "${sess.avgDeltaMs} ms",
                    color = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    label = stringResource(id = R.string.label_max_delta),
                    value = "${sess.maxDeltaMs} ms",
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    label = stringResource(id = R.string.label_p95_delta),
                    value = "${sess.p95DeltaMs} ms",
                    color = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = stringResource(id = R.string.label_captured_redraw_splits, laps.size),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(10.dp))

                if (laps.isEmpty()) {
                    Text(
                        text = stringResource(id = R.string.msg_no_redraw_splits),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        laps.takeLast(20).reversed().forEach { lap ->
                            RedrawLapItemRow(lap = lap)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun LogcatStopwatchContent() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var isRecording by remember { mutableStateOf(LogcatStopwatchEngine.isRecordingSession) }
    val syncedKeywords by LogcatStopwatchEngine.sharedKeywords.collectAsState()
    var keywordsText by remember(syncedKeywords) { mutableStateOf(syncedKeywords.joinToString(", ")) }
    var laps by remember { mutableStateOf<List<LogcatLap>>(emptyList()) }

    var isHudRunning by remember { mutableStateOf(com.lucasdeeiroz.robotrunner.overlay.StopwatchOverlayService.isRunning) }

    LaunchedEffect(Unit) {
        while (true) {
            isHudRunning = com.lucasdeeiroz.robotrunner.overlay.StopwatchOverlayService.isRunning
            isRecording = LogcatStopwatchEngine.isRecordingSession
            laps = LogcatStopwatchEngine.getLapsSnapshot()
            delay(500)
        }
    }

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(id = R.string.header_floating_hud_stopwatch),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = stringResource(id = R.string.desc_floating_hud_stopwatch),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Button(
                    onClick = {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
                            val intent = Intent(
                                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                Uri.parse("package:${context.packageName}")
                            ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
                            context.startActivity(intent)
                            Toast.makeText(
                                context,
                                context.getString(R.string.msg_grant_overlay_permission),
                                Toast.LENGTH_LONG
                            ).show()
                        } else {
                            val serviceIntent = Intent(
                                context,
                                com.lucasdeeiroz.robotrunner.overlay.StopwatchOverlayService::class.java
                            )
                            if (isHudRunning) {
                                context.stopService(serviceIntent)
                                isHudRunning = false
                            } else {
                                context.startService(serviceIntent)
                                isHudRunning = true
                            }
                        }
                    },
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isHudRunning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = if (isHudRunning) stringResource(id = R.string.btn_stop_hud) else stringResource(id = R.string.btn_start_hud),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(id = R.string.header_logcat_stopwatch),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = stringResource(id = R.string.desc_logcat_stopwatch),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedTextField(
                    value = keywordsText,
                    onValueChange = { keywordsText = it },
                    label = { Text(stringResource(id = R.string.label_keywords)) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isRecording,
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(16.dp))

                Button(
                    onClick = {
                        if (isRecording) {
                            LogcatStopwatchEngine.stopSession()
                            isRecording = false
                        } else {
                            val keys = keywordsText.split(",").map { it.trim() }
                            LogcatStopwatchEngine.startSession(keys)
                            isRecording = true
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isRecording) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = if (isRecording) stringResource(id = R.string.btn_stop_benchmark) else stringResource(id = R.string.btn_start_logcat_session),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }

                if (!isRecording && laps.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(10.dp))
                    Button(
                        onClick = {
                            coroutineScope.launch {
                                val file = LogcatStopwatchEngine.exportSessionJson()
                                if (file != null) {
                                    Toast.makeText(
                                        context,
                                        context.getString(R.string.msg_benchmark_exported, file.name),
                                        Toast.LENGTH_LONG
                                    ).show()
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = stringResource(id = R.string.btn_export_benchmark),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = stringResource(id = R.string.label_logcat_laps, laps.size),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(10.dp))

                if (laps.isEmpty()) {
                    Text(
                        text = stringResource(id = R.string.msg_no_logcat_laps),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        laps.reversed().forEach { lap ->
                            LogcatLapItemRow(lap = lap)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ScannerStopwatchContent() {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var isScanning by remember { mutableStateOf(ScannerStopwatchEngine.isScanning) }
    var pendingLap by remember { mutableStateOf<ScannerLap?>(ScannerStopwatchEngine.pendingLap) }
    var laps by remember { mutableStateOf<List<ScannerLap>>(emptyList()) }
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        while (true) {
            isScanning = ScannerStopwatchEngine.isScanning
            pendingLap = ScannerStopwatchEngine.pendingLap
            laps = ScannerStopwatchEngine.getLapsSnapshot()
            delay(500)
        }
    }

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(id = R.string.header_scanner_stopwatch),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = stringResource(id = R.string.desc_scanner_stopwatch),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(16.dp))

                if (pendingLap != null) {
                    val lap = pendingLap!!
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(text = lap.barcodeValue, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Text(
                                text = stringResource(id = R.string.label_format, lap.format),
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = "${lap.totalLatencyMs} ms",
                                fontSize = 32.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                color = if (lap.totalLatencyMs < 200) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly
                            ) {
                                StatCard(
                                    label = "Camera Init",
                                    value = "${lap.cameraInitMs}ms",
                                    color = MaterialTheme.colorScheme.secondary
                                )
                                StatCard(
                                    label = "Search & Aim",
                                    value = "${lap.searchMs}ms",
                                    color = MaterialTheme.colorScheme.secondary
                                )
                                StatCard(
                                    label = "ML Decode",
                                    value = "${lap.decodeMs}ms",
                                    color = MaterialTheme.colorScheme.secondary
                                )
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Button(
                                    onClick = { ScannerStopwatchEngine.discardPendingLap() },
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.outlineVariant),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text(
                                        text = stringResource(id = R.string.btn_discard),
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                                Button(
                                    onClick = { ScannerStopwatchEngine.savePendingLap() },
                                    modifier = Modifier.weight(1f),
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text(text = stringResource(id = R.string.btn_save_round))
                                }
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                } else if (isScanning && hasCameraPermission) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(1f)
                            .clip(RoundedCornerShape(12.dp))
                    ) {
                        AndroidView(
                            factory = { ctx ->
                                val previewView = PreviewView(ctx)
                                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                                cameraProviderFuture.addListener({
                                    val cameraProvider = cameraProviderFuture.get()
                                    val preview = Preview.Builder().build().also {
                                        it.setSurfaceProvider(previewView.surfaceProvider)
                                    }
                                    val imageAnalysis = ImageAnalysis.Builder()
                                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                        .build()

                                    imageAnalysis.setAnalyzer(ContextCompat.getMainExecutor(ctx)) { imageProxy ->
                                        ScannerStopwatchEngine.processImageProxy(imageProxy)
                                    }

                                    val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
                                    try {
                                        cameraProvider.unbindAll()
                                        cameraProvider.bindToLifecycle(
                                            lifecycleOwner, cameraSelector, preview, imageAnalysis
                                        )
                                    } catch (exc: Exception) {
                                        Toast.makeText(
                                            ctx,
                                            context.getString(R.string.msg_camera_error),
                                            Toast.LENGTH_SHORT
                                        ).show()
                                    }
                                }, ContextCompat.getMainExecutor(ctx))
                                previewView
                            },
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }

                if (pendingLap == null) {
                    Button(
                        onClick = {
                            if (isScanning) {
                                ScannerStopwatchEngine.stopSession()
                            } else {
                                if (hasCameraPermission) {
                                    ScannerStopwatchEngine.startSession()
                                } else {
                                    launcher.launch(Manifest.permission.CAMERA)
                                    Toast.makeText(
                                        context,
                                        context.getString(R.string.msg_camera_permission),
                                        Toast.LENGTH_SHORT
                                    ).show()
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isScanning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = if (isScanning) stringResource(id = R.string.btn_stop_benchmark) else stringResource(
                                id = R.string.btn_start_scanner_session
                            ),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = stringResource(id = R.string.label_scanner_laps, laps.size),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(10.dp))

                if (laps.isEmpty()) {
                    Text(
                        text = stringResource(id = R.string.msg_no_scanner_laps),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        laps.reversed().forEach { lap ->
                            ScannerLapItemRow(lap = lap)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun StatCard(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(10.dp),
        modifier = modifier
    ) {
        Column(
            modifier = Modifier.padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = label,
                fontSize = 8.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = value,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = color,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}

@Composable
fun RedrawLapItemRow(lap: RedrawLap) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "#${lap.lapNumber}",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = lap.packageName.substringAfterLast('.'),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Text(
                text = "${lap.deltaMs} ms",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                color = if (lap.deltaMs < 50) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary
            )
        }
    }
}

@Composable
fun LogcatLapItemRow(lap: LogcatLap) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "#${lap.lapNumber} - ${lap.keyword}",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            Text(
                text = "${lap.deltaMs} ms",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.secondary
            )
        }
    }
}

@Composable
fun ScannerLapItemRow(lap: ScannerLap) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = lap.barcodeValue,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = stringResource(id = R.string.label_format, lap.format),
                        fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Text(
                    text = "${lap.totalLatencyMs} ms",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = if (lap.totalLatencyMs < 200) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Init: ${lap.cameraInitMs}ms",
                    fontSize = 9.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    text = "Aim: ${lap.searchMs}ms",
                    fontSize = 9.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    text = "Decode: ${lap.decodeMs}ms",
                    fontSize = 9.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
    }
}
