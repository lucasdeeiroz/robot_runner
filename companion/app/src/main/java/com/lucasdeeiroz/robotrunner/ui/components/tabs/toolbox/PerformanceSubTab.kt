package com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox

import com.lucasdeeiroz.robotrunner.performance.PerformanceSample
import com.lucasdeeiroz.robotrunner.performance.PerformanceCollector
import com.lucasdeeiroz.robotrunner.performance.FloatingHudService
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.BatteryChargingFull
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.MonitorHeart
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.Window
import androidx.compose.material.icons.rounded.Lightbulb
import androidx.compose.material.icons.rounded.BatterySaver
import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.view.WindowManager
import androidx.core.content.ContextCompat
import com.lucasdeeiroz.robotrunner.performance.BatteryAuditEngine
import com.lucasdeeiroz.robotrunner.performance.BatteryAuditItem
import kotlinx.coroutines.launch
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
import com.lucasdeeiroz.robotrunner.performance.formatPower
import com.lucasdeeiroz.robotrunner.performance.formatRam
import kotlinx.coroutines.delay

fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@Composable
fun PerformanceSubTab() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var historySamples by remember { mutableStateOf<List<PerformanceSample>>(emptyList()) }
    var isHudRunning by remember { mutableStateOf(com.lucasdeeiroz.robotrunner.overlay.PerformanceOverlayService.isRunning) }
    var keepAwake by remember { mutableStateOf(false) }
    var batteryAuditResults by remember { mutableStateOf<List<BatteryAuditItem>?>(null) }
    var isAuditing by remember { mutableStateOf(false) }
    var hasDumpPermission by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        PerformanceCollector.startCollecting(context)
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
        while (true) {
            historySamples = PerformanceCollector.getHistorySnapshot()
            isHudRunning = com.lucasdeeiroz.robotrunner.overlay.PerformanceOverlayService.isRunning

            val dumpGranted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.DUMP
            ) == PackageManager.PERMISSION_GRANTED
            val usageStatsGranted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.PACKAGE_USAGE_STATS
            ) == PackageManager.PERMISSION_GRANTED
            val batteryStatsGranted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.BATTERY_STATS
            ) == PackageManager.PERMISSION_GRANTED

            hasDumpPermission = dumpGranted && usageStatsGranted && batteryStatsGranted
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
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.weight(1f)
            )
            GaugeCard(
                title = stringResource(id = R.string.gauge_ram_title),
                value = "${
                    ((latestSample?.ramUsedMb?.toFloat() ?: 0f) / (latestSample?.ramTotalMb?.toFloat()
                        ?.takeIf { it > 0f } ?: 1f) * 100).toInt()
                }%",
                subtitle = "${formatRam(latestSample?.ramUsedMb ?: 0)} / ${formatRam(latestSample?.ramTotalMb ?: 0)}",
                color = MaterialTheme.colorScheme.tertiary,
                modifier = Modifier.weight(1f)
            )
            GaugeCard(
                title = stringResource(id = R.string.gauge_battery_title),
                value = formatPower(latestSample?.batteryCurrentMa ?: 0),
                subtitle = "${latestSample?.batteryTempC?.toInt() ?: 0} ºC",
                color = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.weight(1f)
            )
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Rounded.Speed,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(end = 8.dp).size(24.dp)
                        )
                        Text(
                            text = stringResource(id = R.string.chart_cpu_title),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Text(
                        text = "${latestSample?.cpuUsagePercent?.toInt() ?: 0}%",
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                PerformanceLineChart(
                    dataPoints = historySamples.map { it.cpuUsagePercent },
                    maxY = 100f,
                    lineColor = MaterialTheme.colorScheme.primary
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Rounded.Memory,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.tertiary,
                            modifier = Modifier.padding(end = 8.dp).size(24.dp)
                        )
                        Text(
                            text = stringResource(id = R.string.chart_ram_title),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Text(
                        text = formatRam(latestSample?.ramUsedMb ?: 0),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.tertiary
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                val maxRam = (latestSample?.ramTotalMb?.toFloat() ?: 4096f)
                PerformanceLineChart(
                    dataPoints = historySamples.map { it.ramUsedMb.toFloat() },
                    maxY = maxRam,
                    lineColor = MaterialTheme.colorScheme.tertiary
                )
            }
        }

        // Real-Time Power Trend Chart Card
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Rounded.BatteryChargingFull,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.padding(end = 8.dp).size(24.dp)
                        )
                        Text(
                            text = stringResource(id = R.string.chart_power_title),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Text(
                        text = formatPower(latestSample?.batteryCurrentMa ?: 0),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.secondary
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                val maxMa = 3000f
                PerformanceLineChart(
                    dataPoints = historySamples.map { Math.abs(it.batteryCurrentMa).toFloat() },
                    maxY = maxMa,
                    lineColor = MaterialTheme.colorScheme.secondary
                )
            }
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Rounded.Window,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.padding(end = 8.dp).size(24.dp)
                        )
                        Text(
                            text = stringResource(id = R.string.header_floating_hud),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
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
                            Toast.makeText(
                                context,
                                context.getString(R.string.msg_grant_overlay_permission),
                                Toast.LENGTH_LONG
                            ).show()
                        } else {
                            val serviceIntent = Intent(
                                context,
                                com.lucasdeeiroz.robotrunner.overlay.PerformanceOverlayService::class.java
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



        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(top = 16.dp, bottom = 4.dp)
        ) {
            Icon(
                imageVector = Icons.Rounded.Bolt,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(end = 6.dp).size(20.dp)
            )
            Text(
                text = stringResource(id = R.string.header_quick_actions),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
        }

        // Keep Awake Card
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Rounded.Lightbulb,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.padding(end = 8.dp).size(24.dp)
                        )
                        Text(
                            text = stringResource(id = R.string.header_keep_awake),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Text(
                        text = stringResource(id = R.string.desc_keep_awake),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Switch(
                    checked = keepAwake,
                    onCheckedChange = {
                        keepAwake = it
                        val activity = context.findActivity()
                        if (it) {
                            activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        } else {
                            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                        }
                    }
                )
            }
        }

        // Battery Audit Card
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
                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .padding(end = 16.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = Icons.Rounded.BatterySaver,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.padding(end = 8.dp).size(24.dp)
                            )
                            Text(
                                text = stringResource(id = R.string.header_battery_audit),
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = stringResource(id = R.string.desc_battery_audit),
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Button(
                            onClick = {
                                if (hasDumpPermission) {
                                    isAuditing = true
                                    coroutineScope.launch {
                                        batteryAuditResults = BatteryAuditEngine.runAudit(context)
                                        isAuditing = false
                                    }
                                }
                            },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (hasDumpPermission) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                text = if (isAuditing) "..." else if (hasDumpPermission) stringResource(id = R.string.btn_run_audit) else stringResource(
                                    id = R.string.btn_grant_dump
                                ),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        if (hasDumpPermission && batteryAuditResults != null) {
                            Button(
                                onClick = {
                                    coroutineScope.launch {
                                        BatteryAuditEngine.resetBatteryStats()
                                        batteryAuditResults = null
                                        Toast.makeText(
                                            context,
                                            context.getString(R.string.msg_stats_reset),
                                            Toast.LENGTH_SHORT
                                        ).show()
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.errorContainer,
                                    contentColor = MaterialTheme.colorScheme.onErrorContainer
                                ),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.padding(bottom = 8.dp)
                            ) {
                                Text(
                                    text = stringResource(id = R.string.btn_reset),
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }

                if (!hasDumpPermission) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = stringResource(id = R.string.msg_grant_dump_cmd),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.background(
                            MaterialTheme.colorScheme.errorContainer,
                            RoundedCornerShape(4.dp)
                        ).padding(8.dp)
                    )
                }

                if (batteryAuditResults != null && hasDumpPermission) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = stringResource(id = R.string.label_app_name),
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(0.70f)
                        )
                        Text(
                            text = stringResource(id = R.string.label_consumption),
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(0.30f)
                        )
                    }
                    HorizontalDivider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.1f))
                    val auditList = batteryAuditResults!!.take(10)
                    auditList.forEachIndexed { index, item ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = item.packageName,
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.weight(0.70f),
                                maxLines = 1
                            )
                            Text(
                                text = "${item.consumptionMah} mAh",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.weight(0.30f)
                            )
                        }
                        if (index < auditList.size - 1) {
                            HorizontalDivider(color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f))
                        }
                    }
                }
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
