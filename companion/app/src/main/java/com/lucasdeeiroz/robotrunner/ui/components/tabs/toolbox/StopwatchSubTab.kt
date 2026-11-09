package com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.CaptureResult
import android.hardware.camera2.TotalCaptureResult
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Size
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.AspectRatio
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
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
import java.util.concurrent.Executors

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

@androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
@Composable
fun ScannerStopwatchContent() {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val coroutineScope = rememberCoroutineScope()

    val startMode by ScannerStopwatchEngine.startModeFlow.collectAsState()
    val isTorchEnabled by ScannerStopwatchEngine.isTorchEnabledFlow.collectAsState()
    val isScanning by ScannerStopwatchEngine.isScanningFlow.collectAsState()
    val pendingLap by ScannerStopwatchEngine.pendingLapFlow.collectAsState()
    val laps by ScannerStopwatchEngine.lapsFlow.collectAsState()
    val estimatedDistance by ScannerStopwatchEngine.estimatedDistanceCmFlow.collectAsState()

    val cameraExecutor = remember {
        Executors.newSingleThreadExecutor { runnable ->
            Thread(runnable, "ScannerFastExecutor").apply {
                priority = Thread.MAX_PRIORITY
            }
        }
    }
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    var activeCamera by remember { mutableStateOf<Camera?>(null) }

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

    DisposableEffect(Unit) {
        onDispose {
            try {
                cameraExecutor.shutdown()
                if (cameraProviderFuture.isDone) {
                    cameraProviderFuture.get().unbindAll()
                }
            } catch (_: Throwable) {}
        }
    }

    // Pre-warm MLKit client and native libs as soon as this tab is composed
    LaunchedEffect(Unit) {
        ScannerStopwatchEngine.warmUp()
    }

    // Reactively toggle torch when state changes on the active camera
    LaunchedEffect(isTorchEnabled, activeCamera) {
        try {
            if (activeCamera?.cameraInfo?.hasFlashUnit() == true) {
                activeCamera?.cameraControl?.enableTorch(isTorchEnabled)
            }
        } catch (_: Throwable) {}
    }

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Mode & Flash Controls Card (Available BEFORE test starts)
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
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
                    }

                    // Torch Toggle Button (Always accessible before & during test)
                    Surface(
                        color = if (isTorchEnabled) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .clickable {
                                val next = !isTorchEnabled
                                ScannerStopwatchEngine.setTorchEnabled(next)
                                try {
                                    activeCamera?.cameraControl?.enableTorch(next)
                                } catch (_: Throwable) {}
                            }
                            .padding(4.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = if (isTorchEnabled) Icons.Default.FlashOn else Icons.Default.FlashOff,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = if (isTorchEnabled) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = if (isTorchEnabled) stringResource(id = R.string.scanner_torch_on) else stringResource(id = R.string.scanner_torch_off),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isTorchEnabled) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                // Start Mode Selector (Hot Start vs Cold Start)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Surface(
                        color = if (startMode == ScannerStartMode.HOT) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .weight(1f)
                            .clickable(enabled = !isScanning) {
                                ScannerStopwatchEngine.setStartMode(ScannerStartMode.HOT)
                            }
                    ) {
                        Column(modifier = Modifier.padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = stringResource(id = R.string.scanner_mode_hot),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (startMode == ScannerStartMode.HOT) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = stringResource(id = R.string.scanner_mode_hot_sub),
                                fontSize = 9.sp,
                                color = if (startMode == ScannerStartMode.HOT) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Surface(
                        color = if (startMode == ScannerStartMode.COLD) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier
                            .weight(1f)
                            .clickable(enabled = !isScanning) {
                                ScannerStopwatchEngine.setStartMode(ScannerStartMode.COLD)
                            }
                    ) {
                        Column(modifier = Modifier.padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = stringResource(id = R.string.scanner_mode_cold),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (startMode == ScannerStartMode.COLD) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = stringResource(id = R.string.scanner_mode_cold_sub),
                                fontSize = 9.sp,
                                color = if (startMode == ScannerStartMode.COLD) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                // Mode Explanation Banner
                Text(
                    text = if (startMode == ScannerStartMode.HOT) stringResource(id = R.string.scanner_mode_hot_desc) else stringResource(id = R.string.scanner_mode_cold_desc),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Active Benchmarking / Staging / Pending Lap Section
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                if (pendingLap != null) {
                    // Pending Lap Result Card (shows saved/discarded state and returns to Hot Staging smoothly)
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
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Surface(
                                    color = if (lap.startMode == "HOT") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.secondaryContainer,
                                    shape = RoundedCornerShape(6.dp)
                                ) {
                                    Text(
                                        text = if (lap.startMode == "HOT") stringResource(id = R.string.scanner_mode_hot_tag) else stringResource(id = R.string.scanner_mode_cold_tag),
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (lap.startMode == "HOT") MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSecondaryContainer,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }

                                if (lap.estimatedDistanceCm != null) {
                                    Surface(
                                        color = MaterialTheme.colorScheme.tertiaryContainer,
                                        shape = RoundedCornerShape(6.dp)
                                    ) {
                                        Text(
                                            text = "🎯 ${lap.estimatedDistanceCm} cm",
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = if (lap.startMode == "HOT") MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSecondaryContainer,
                                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))
                            Text(text = lap.barcodeValue, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                            Text(
                                text = "${lap.formatName} (${lap.format})",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Spacer(modifier = Modifier.height(10.dp))
                            Text(
                                text = "${lap.totalLatencyMs} ms",
                                fontSize = 36.sp,
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
                                    label = stringResource(id = R.string.scanner_stat_init),
                                    value = "${lap.cameraInitMs}ms",
                                    color = MaterialTheme.colorScheme.secondary
                                )
                                StatCard(
                                    label = stringResource(id = R.string.scanner_stat_search),
                                    value = "${lap.searchMs}ms",
                                    color = MaterialTheme.colorScheme.secondary
                                )
                                StatCard(
                                    label = stringResource(id = R.string.scanner_stat_decode),
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
                } else if (hasCameraPermission) {
                    // Check if camera should be rendered:
                    // Hot Start: always rendered (Staging + Live Scanning)
                    // Cold Start: rendered only while isScanning == true
                    val shouldShowCamera = (startMode == ScannerStartMode.HOT) || isScanning

                    if (shouldShowCamera) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .aspectRatio(1.2f)
                                .clip(RoundedCornerShape(12.dp))
                        ) {
                            AndroidView(
                                factory = { ctx ->
                                    val pv = PreviewView(ctx).apply {
                                        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                                        scaleType = PreviewView.ScaleType.FILL_CENTER
                                    }
                                    cameraProviderFuture.addListener({
                                        try {
                                            val cameraProvider = cameraProviderFuture.get()
                                            val preview = Preview.Builder().build().also {
                                                it.setSurfaceProvider(pv.surfaceProvider)
                                            }

                                            val imageAnalysis = ImageAnalysis.Builder()
                                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                                .build()

                                            imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
                                                ScannerStopwatchEngine.processImageProxy(imageProxy)
                                            }

                                            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
                                            cameraProvider.unbindAll()
                                            val cam = cameraProvider.bindToLifecycle(
                                                lifecycleOwner, cameraSelector, preview, imageAnalysis
                                            )
                                            activeCamera = cam
                                            if (cam.cameraInfo.hasFlashUnit()) {
                                                cam.cameraControl.enableTorch(isTorchEnabled)
                                            }
                                        } catch (exc: Exception) {
                                            android.util.Log.e("ScannerStopwatch", "Camera bind error", exc)
                                        }
                                    }, ContextCompat.getMainExecutor(ctx))
                                    pv
                                },
                                modifier = Modifier.fillMaxSize()
                            )

                            // Reticle / Alignment Target Overlay
                            ScannerReticleOverlay(
                                distanceCm = estimatedDistance,
                                isScanning = isScanning,
                                modifier = Modifier.align(Alignment.Center)
                            )

                            // Distance Badge (Top Left)
                            Surface(
                                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier
                                    .align(Alignment.TopStart)
                                    .padding(12.dp)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Text(
                                        text = if (estimatedDistance != null) {
                                            when {
                                                estimatedDistance!! in 15..30 -> stringResource(id = R.string.scanner_distance_optimal, estimatedDistance!!)
                                                estimatedDistance!! < 15 -> stringResource(id = R.string.scanner_distance_close, estimatedDistance!!)
                                                else -> stringResource(id = R.string.scanner_distance_far, estimatedDistance!!)
                                            }
                                        } else {
                                            stringResource(id = R.string.scanner_distance_calibrating)
                                        },
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (estimatedDistance != null && estimatedDistance!! in 15..30) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            MaterialTheme.colorScheme.onSurface
                                        }
                                    )
                                }
                            }

                            // Status Badge (Top Right)
                            Surface(
                                color = if (isScanning) MaterialTheme.colorScheme.primary.copy(alpha = 0.9f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.85f),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(12.dp)
                            ) {
                                Text(
                                    text = if (isScanning) stringResource(id = R.string.status_measuring) else stringResource(id = R.string.status_camera_ready),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isScanning) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                )
                            }
                        }
                    } else {
                        // Cold Start Idle Staging Card (Camera is off until Start Cold is clicked)
                        Surface(
                            color = MaterialTheme.colorScheme.surface,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(160.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(16.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Speed,
                                    contentDescription = null,
                                    modifier = Modifier.size(36.dp),
                                    tint = MaterialTheme.colorScheme.primary
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = stringResource(id = R.string.scanner_mode_cold),
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = stringResource(id = R.string.scanner_cold_idle_desc),
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Scan Action Buttons
                    if (isScanning) {
                        Button(
                            onClick = { ScannerStopwatchEngine.stopSession() },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                text = stringResource(id = R.string.btn_cancel_round),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    } else {
                        Button(
                            onClick = {
                                ScannerStopwatchEngine.startRound(startMode, isTorchEnabled)
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (startMode == ScannerStartMode.HOT) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                text = if (startMode == ScannerStartMode.HOT) {
                                    stringResource(id = R.string.btn_ready_to_scan)
                                } else {
                                    stringResource(id = R.string.btn_start_cold_test)
                                },
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                } else {
                    // Camera Permission Missing Card
                    Surface(
                        color = MaterialTheme.colorScheme.surface,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Text(
                                text = stringResource(id = R.string.msg_camera_permission_required),
                                fontSize = 13.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Button(
                                onClick = { launcher.launch(Manifest.permission.CAMERA) },
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(
                                    text = stringResource(id = R.string.btn_grant_camera_permission),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }
        }

        // Session Summary Statistics Cards (Min, Avg, Max, P95)
        val summary = remember(laps) { ScannerStopwatchEngine.getSessionSummary() }
        summary?.let { sess ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StatCard(
                    label = stringResource(id = R.string.label_min_delta),
                    value = "${sess.minLatencyMs} ms",
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    label = stringResource(id = R.string.label_avg_delta),
                    value = "${sess.avgLatencyMs} ms",
                    color = MaterialTheme.colorScheme.secondary,
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    label = stringResource(id = R.string.label_max_delta),
                    value = "${sess.maxLatencyMs} ms",
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.weight(1f)
                )
                StatCard(
                    label = stringResource(id = R.string.label_p95_delta),
                    value = "${sess.p95LatencyMs} ms",
                    color = MaterialTheme.colorScheme.tertiary,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        // Laps History Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(id = R.string.label_scanner_laps, laps.size),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )

                    if (laps.isNotEmpty()) {
                        TextButton(
                            onClick = { ScannerStopwatchEngine.clearLaps() }
                        ) {
                            Text(
                                text = stringResource(id = R.string.btn_clear),
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                }

                if (laps.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Button(
                        onClick = {
                            coroutineScope.launch {
                                val file = ScannerStopwatchEngine.exportSessionJson(context)
                                if (file != null) {
                                    Toast.makeText(
                                        context,
                                        context.getString(R.string.msg_scanner_exported, file.name),
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
                            text = stringResource(id = R.string.btn_export_scanner_benchmark),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.height(10.dp))
                }

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
fun ScannerReticleOverlay(distanceCm: Int?, isScanning: Boolean, modifier: Modifier = Modifier) {
    val reticleColor = when {
        isScanning -> MaterialTheme.colorScheme.primary
        distanceCm != null && distanceCm in 15..30 -> MaterialTheme.colorScheme.primary
        distanceCm != null && distanceCm < 15 -> MaterialTheme.colorScheme.error
        distanceCm != null -> MaterialTheme.colorScheme.tertiary
        else -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
    }

    Box(
        modifier = modifier
            .size(180.dp)
            .border(
                border = BorderStroke(2.dp, reticleColor.copy(alpha = if (isScanning) 0.9f else 0.5f)),
                shape = RoundedCornerShape(16.dp)
            )
    )
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
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "#${lap.lapNumber}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Surface(
                        color = if (lap.startMode == "HOT") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.secondaryContainer,
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = lap.startMode,
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (lap.startMode == "HOT") MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSecondaryContainer,
                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                        )
                    }
                    if (lap.torchEnabled) {
                        Text(
                            text = "⚡ Flash",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.tertiary
                        )
                    }
                    if (lap.estimatedDistanceCm != null) {
                        Text(
                            text = "🎯 ${lap.estimatedDistanceCm}cm",
                            fontSize = 9.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                Text(
                    text = "${lap.totalLatencyMs} ms",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = if (lap.totalLatencyMs < 200) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.tertiary
                )
            }

            Text(
                text = "${lap.barcodeValue} (${lap.formatName})",
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "Boot: ${lap.cameraInitMs}ms",
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
