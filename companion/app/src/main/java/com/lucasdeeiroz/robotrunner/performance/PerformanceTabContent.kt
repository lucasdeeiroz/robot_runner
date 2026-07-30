package com.lucasdeeiroz.robotrunner.performance

import com.lucasdeeiroz.robotrunner.ui.pages.GaugeCard

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lucasdeeiroz.robotrunner.R
import kotlinx.coroutines.delay

@Composable
fun PerformanceTabContent() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var historySamples by remember { mutableStateOf<List<PerformanceSample>>(emptyList()) }
    var isHudRunning by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        PerformanceCollector.startCollecting(context, coroutineScope)
        while (true) {
            historySamples = PerformanceCollector.getHistorySnapshot()
            delay(1000)
        }
    }

    val latestSample = historySamples.lastOrNull()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Live Telemetry Gauges Grid
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            GaugeCard(
                title = stringResource(id = R.string.gauge_cpu_title),
                value = "${latestSample?.cpuUsagePercent?.toInt() ?: 0}%",
                subtitle = stringResource(id = R.string.gauge_cpu_sub),
                color = Color(0xFF38BDF8),
                modifier = Modifier.weight(1f)
            )
            GaugeCard(
                title = stringResource(id = R.string.gauge_ram_title),
                value = "${((latestSample?.ramUsedMb?.toFloat() ?: 0f) / (latestSample?.ramTotalMb?.toFloat()?.takeIf { it > 0f } ?: 1f) * 100).toInt()}%",
                subtitle = "${latestSample?.ramUsedMb ?: 0}/${latestSample?.ramTotalMb ?: 0} MB",
                color = Color(0xFF10B981),
                modifier = Modifier.weight(1f)
            )
        }

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
                        text = stringResource(id = R.string.header_floating_hud),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = stringResource(id = R.string.desc_floating_hud),
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
                            val serviceIntent = Intent(context, FloatingHudService::class.java)
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

        // Real-Time CPU Trend Chart Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = stringResource(id = R.string.chart_cpu_title),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "${latestSample?.cpuUsagePercent?.toInt() ?: 0}%",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF38BDF8)
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                PerformanceLineChart(
                    dataPoints = historySamples.map { it.cpuUsagePercent },
                    maxY = 100f,
                    lineColor = Color(0xFF38BDF8)
                )
            }
        }

        // Real-Time RAM Trend Chart Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = stringResource(id = R.string.chart_ram_title),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "${latestSample?.ramUsedMb ?: 0} MB",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF22C55E)
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                val maxRam = (latestSample?.ramTotalMb?.toFloat() ?: 4096f)
                PerformanceLineChart(
                    dataPoints = historySamples.map { it.ramUsedMb.toFloat() },
                    maxY = maxRam,
                    lineColor = Color(0xFF22C55E)
                )
            }
        }
    }
}

@Composable
fun PerformanceLineChart(
    dataPoints: List<Float>,
    maxY: Float,
    lineColor: Color
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(120.dp)
            .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(8.dp))
            .padding(8.dp)
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            if (dataPoints.size < 2) return@Canvas

            val width = size.width
            val height = size.height
            val stepX = width / (dataPoints.size - 1)
            
            val verticalPadding = 3.dp.toPx()
            val availableHeight = height - (verticalPadding * 2)

            val path = Path()
            dataPoints.forEachIndexed { index, value ->
                val normY = (value / maxY).coerceIn(0f, 1f)
                val x = index * stepX
                val y = verticalPadding + (availableHeight - (normY * availableHeight))

                if (index == 0) {
                    path.moveTo(x, y)
                } else {
                    path.lineTo(x, y)
                }
            }

            drawPath(
                path = path,
                color = lineColor,
                style = Stroke(width = 3.dp.toPx())
            )
        }
    }
}
