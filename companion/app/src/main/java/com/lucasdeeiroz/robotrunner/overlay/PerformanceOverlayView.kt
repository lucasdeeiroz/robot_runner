package com.lucasdeeiroz.robotrunner.overlay

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lucasdeeiroz.robotrunner.performance.PerformanceCollector
import com.lucasdeeiroz.robotrunner.performance.PerformanceSample
import com.lucasdeeiroz.robotrunner.performance.formatPower
import com.lucasdeeiroz.robotrunner.performance.formatRam
import com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox.PerformanceLineChart
import com.lucasdeeiroz.robotrunner.ui.theme.RobotRunnerTheme
import kotlinx.coroutines.delay

@Composable
fun PerformanceOverlayView(
    onClose: () -> Unit,
    onOpenApp: () -> Unit,
    onDrag: (Float, Float) -> Unit
) {
    var isExpanded by remember { mutableStateOf(false) }
    var historySamples by remember { mutableStateOf<List<PerformanceSample>>(emptyList()) }
    var latestSample by remember { mutableStateOf<PerformanceSample?>(null) }
    var lastInteractionTime by remember { mutableStateOf(System.currentTimeMillis()) }

    LaunchedEffect(Unit) {
        while (true) {
            historySamples = PerformanceCollector.getHistorySnapshot()
            latestSample = historySamples.lastOrNull()
            delay(1000)
        }
    }
    
    var isActive by remember { mutableStateOf(true) }

    LaunchedEffect(lastInteractionTime) {
        isActive = true
        delay(5000)
        isActive = false
    }

    val currentAlpha by animateFloatAsState(targetValue = if (isActive) 1f else 0.5f, label = "alpha")

    RobotRunnerTheme {
        Surface(
            modifier = Modifier
                .width(if (isExpanded) 220.dp else 180.dp)
                .wrapContentHeight()
                .alpha(currentAlpha)
                .pointerInput(Unit) {
                    awaitPointerEventScope {
                        while (true) {
                            awaitPointerEvent()
                            lastInteractionTime = System.currentTimeMillis()
                        }
                    }
                },
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
            shadowElevation = 8.dp
        ) {
            Column {
                // Header (Draggable)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .pointerInput(Unit) {
                            detectDragGestures(
                                onDragStart = { lastInteractionTime = System.currentTimeMillis() },
                                onDragEnd = { lastInteractionTime = System.currentTimeMillis() },
                                onDrag = { change, dragAmount ->
                                    change.consume()
                                    onDrag(dragAmount.x, dragAmount.y)
                                    lastInteractionTime = System.currentTimeMillis()
                                }
                            )
                        }
                        .background(MaterialTheme.colorScheme.primaryContainer)
                        .padding(horizontal = 4.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    IconButton(
                        onClick = { 
                            isExpanded = !isExpanded 
                            lastInteractionTime = System.currentTimeMillis()
                        },
                        modifier = Modifier.size(28.dp)
                    ) {
                        Icon(
                            imageVector = if (isExpanded) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown,
                            contentDescription = "Expand/Collapse",
                            tint = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                    Text(
                        text = "RR Performance",
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 2.dp)
                    )

                    Row {

                        IconButton(
                            onClick = {
                                lastInteractionTime = System.currentTimeMillis()
                                onOpenApp()
                            },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.OpenInNew,
                                contentDescription = "Open App",
                                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        IconButton(
                            onClick = {
                                lastInteractionTime = System.currentTimeMillis()
                                onClose()
                            },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = "Close",
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }

                Column(modifier = Modifier.padding(8.dp)) {
                    // Expanded Content (Charts)
                    if (isExpanded) {
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "CPU:",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "${latestSample?.cpuUsagePercent?.toInt() ?: 0}%",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                        Spacer(modifier = Modifier.height(2.dp))
                        PerformanceLineChart(
                            dataPoints = historySamples.map { it.cpuUsagePercent },
                            maxY = 100f,
                            lineColor = MaterialTheme.colorScheme.primary
                        )

                        Spacer(modifier = Modifier.height(4.dp))
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "RAM:",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = formatRam(latestSample?.ramUsedMb ?: 0),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.tertiary
                            )
                        }
                        Spacer(modifier = Modifier.height(2.dp))
                        val maxRam = (latestSample?.ramTotalMb?.toFloat() ?: 4096f)
                        PerformanceLineChart(
                            dataPoints = historySamples.map { it.ramUsedMb.toFloat() },
                            maxY = maxRam,
                            lineColor = MaterialTheme.colorScheme.tertiary
                            )
                        Spacer(modifier = Modifier.height(4.dp))
                        
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "Power:",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = formatPower(latestSample?.batteryCurrentMa ?: 0),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.secondary
                                )
                            }
                        Spacer(modifier = Modifier.height(2.dp))
                        val maxMa = 3000f
                        PerformanceLineChart(
                            dataPoints = historySamples.map { Math.abs(it.batteryCurrentMa).toFloat() },
                            maxY = maxMa,
                            lineColor = MaterialTheme.colorScheme.secondary
                            )
                        }
                        else
                        {
                            // Compact Content
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "CPU:",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "${latestSample?.cpuUsagePercent?.toInt() ?: 0}%",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }

                            Spacer(modifier = Modifier.height(2.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "RAM:",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = formatRam(latestSample?.ramUsedMb ?: 0),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.tertiary
                                )
                            }
                            
                            Spacer(modifier = Modifier.height(2.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = "Power:",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = formatPower(latestSample?.batteryCurrentMa ?: 0),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.secondary
                                )
                            }
                        }
                    }
                }
            }
        }
    }
