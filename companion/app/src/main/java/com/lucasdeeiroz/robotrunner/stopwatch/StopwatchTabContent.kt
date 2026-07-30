package com.lucasdeeiroz.robotrunner.stopwatch

import android.content.Intent
import android.net.Uri
import android.os.Build
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
import com.lucasdeeiroz.robotrunner.R
import com.lucasdeeiroz.robotrunner.performance.FloatingHudService
import com.lucasdeeiroz.robotrunner.service.CompanionAccessibilityService
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun StopwatchTabContent() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var lastDeltaMs by remember { mutableLongStateOf(0L) }
    var activePackage by remember { mutableStateOf("") }
    var isRecording by remember { mutableStateOf(RedrawStopwatchEngine.isRecordingSession) }
    var currentSession by remember { mutableStateOf<BenchmarkSession?>(null) }
    var laps by remember { mutableStateOf<List<RedrawLap>>(emptyList()) }

    var isHudRunning by remember { mutableStateOf(FloatingHudService.isRunning) }

    LaunchedEffect(Unit) {
        while (true) {
            isHudRunning = FloatingHudService.isRunning
            lastDeltaMs = CompanionAccessibilityService.lastFrameRedrawDeltaMs
            activePackage = CompanionAccessibilityService.activePackageName ?: "unknown"
            laps = RedrawStopwatchEngine.getLapsSnapshot()

            if (isRecording && lastDeltaMs > 0) {
                // Record dynamic lap if delta updated
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
        lastDeltaMs <= 0 -> Color(0xFF64748B)
        lastDeltaMs < 50 -> Color(0xFF22C55E)
        lastDeltaMs < 200 -> Color(0xFFF59E0B)
        else -> Color(0xFFEF4444)
    }

    val deltaStatusText = when {
        lastDeltaMs <= 0 -> "STANDBY"
        lastDeltaMs < 50 -> stringResource(id = R.string.status_fast_ui)
        lastDeltaMs < 200 -> stringResource(id = R.string.status_normal_ui)
        else -> stringResource(id = R.string.status_slow_ui)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Overlay HUD Toggle Header Card
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
                            Toast.makeText(context, context.getString(R.string.msg_grant_overlay_permission), Toast.LENGTH_LONG).show()
                        } else {
                            val serviceIntent = Intent(context, FloatingHudService::class.java).apply {
                                putExtra(FloatingHudService.EXTRA_HUD_MODE, FloatingHudService.MODE_STOPWATCH)
                            }
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
                        containerColor = if (isHudRunning) Color(0xFFEF4444) else Color(0xFF6366F1)
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
        // Live Meter Card
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

                // Big Delta Gauge
                Text(
                    text = "${lastDeltaMs} ms",
                    fontSize = 42.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = deltaStatusColor
                )

                Surface(
                    color = deltaStatusColor,
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = deltaStatusText,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                    )
                }
            }
        }

        // Benchmark Session Controls Card
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
                            containerColor = if (isRecording) Color(0xFFEF4444) else Color(0xFF6366F1)
                        ),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(
                            text = if (isRecording) stringResource(id = R.string.btn_stop_benchmark) else stringResource(id = R.string.btn_start_benchmark),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Button(
                        onClick = {
                            val now = System.currentTimeMillis()
                            val touchTs = if (CompanionAccessibilityService.lastTouchTimestamp > 0) CompanionAccessibilityService.lastTouchTimestamp else now - lastDeltaMs
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
                                Toast.makeText(context, context.getString(R.string.msg_benchmark_exported, file.name), Toast.LENGTH_LONG).show()
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(text = stringResource(id = R.string.btn_export_benchmark), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        // Stats Gauge Row
        currentSession?.let { sess ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                StatCard(label = stringResource(id = R.string.label_min_delta), value = "${sess.minDeltaMs} ms", color = Color(0xFF22C55E), modifier = Modifier.weight(1f))
                StatCard(label = stringResource(id = R.string.label_avg_delta), value = "${sess.avgDeltaMs} ms", color = Color(0xFF38BDF8), modifier = Modifier.weight(1f))
                StatCard(label = stringResource(id = R.string.label_max_delta), value = "${sess.maxDeltaMs} ms", color = Color(0xFFEF4444), modifier = Modifier.weight(1f))
                StatCard(label = stringResource(id = R.string.label_p95_delta), value = "${sess.p95DeltaMs} ms", color = Color(0xFFA855F7), modifier = Modifier.weight(1f))
            }
        }

        // Laps Table
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Captured Redraw Splits (${laps.size})",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(10.dp))

                if (laps.isEmpty()) {
                    Text(text = "No redraw splits recorded yet. Tap Start Recording.", fontSize = 12.sp, color = Color(0xFF64748B))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        laps.takeLast(20).reversed().forEach { lap ->
                            LapItemRow(lap = lap)
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
            Text(text = label, fontSize = 8.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = value, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = color, fontFamily = FontFamily.Monospace)
        }
    }
}

@Composable
fun LapItemRow(lap: RedrawLap) {
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
                Text(text = "#${lap.lapNumber}", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Color(0xFF6366F1))
                Spacer(modifier = Modifier.width(10.dp))
                Text(text = lap.packageName.substringAfterLast('.'), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface)
            }

            Text(
                text = "${lap.deltaMs} ms",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                color = if (lap.deltaMs < 50) Color(0xFF22C55E) else Color(0xFFF59E0B)
            )
        }
    }
}
