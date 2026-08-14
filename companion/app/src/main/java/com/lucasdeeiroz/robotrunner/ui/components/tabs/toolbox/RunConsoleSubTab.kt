package com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lucasdeeiroz.robotrunner.R
import com.lucasdeeiroz.robotrunner.server.RrtEngine
import kotlinx.coroutines.launch

@Composable
fun RunConsoleSubTab() {
    val logs by RrtEngine.logsFlow.collectAsState()
    val isRunning by RrtEngine.isRunningFlow.collectAsState()
    val currentSuite by RrtEngine.currentSuiteFlow.collectAsState()
    val lastExitCode by RrtEngine.lastExitCodeFlow.collectAsState()

    var searchQuery by remember { mutableStateOf("") }
    var autoScroll by remember { mutableStateOf(true) }

    val listState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    val filteredLogs = remember(logs, searchQuery) {
        if (searchQuery.isBlank()) logs
        else logs.filter { it.contains(searchQuery, ignoreCase = true) }
    }

    // Auto-scroll on new logs
    LaunchedEffect(logs.size, autoScroll) {
        if (autoScroll && filteredLogs.isNotEmpty()) {
            listState.animateScrollToItem(filteredLogs.size - 1)
        }
    }

    Column(
        modifier = Modifier.fillMaxSize()
    ) {
        // Status & Control Header Card
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 8.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f, fill = false)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Code,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = if (!currentSuite.isNullOrEmpty()) {
                                stringResource(id = R.string.run_console_suite_prefix, currentSuite ?: "")
                            } else {
                                stringResource(id = R.string.tab_run_console)
                            },
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Status Badge
                        val (statusText, statusColor, statusBg) = when {
                            isRunning -> Triple(
                                stringResource(id = R.string.run_console_status_running),
                                MaterialTheme.colorScheme.primary,
                                MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
                            )
                            lastExitCode == 0 -> Triple(
                                stringResource(id = R.string.run_console_status_passed),
                                Color(0xFF10B981),
                                Color(0xFF10B981).copy(alpha = 0.15f)
                            )
                            lastExitCode != null && lastExitCode != 0 -> Triple(
                                stringResource(id = R.string.run_console_status_failed),
                                MaterialTheme.colorScheme.error,
                                MaterialTheme.colorScheme.error.copy(alpha = 0.15f)
                            )
                            else -> Triple(
                                stringResource(id = R.string.run_console_status_idle),
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                MaterialTheme.colorScheme.surfaceVariant
                            )
                        }

                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(statusBg)
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = statusText,
                                color = statusColor,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Spacer(modifier = Modifier.width(6.dp))

                        // Clear Button
                        IconButton(
                            onClick = { RrtEngine.clearLogs() },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.DeleteSweep,
                                contentDescription = stringResource(id = R.string.run_console_clear_logs),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        // Auto-scroll toggle
                        IconButton(
                            onClick = { autoScroll = !autoScroll },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.VerticalAlignBottom,
                                contentDescription = stringResource(id = R.string.run_console_auto_scroll),
                                tint = if (autoScroll) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Search Box
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = { searchQuery = it },
                    placeholder = {
                        Text(
                            text = stringResource(id = R.string.run_console_search_placeholder),
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                        )
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Rounded.Search,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            modifier = Modifier.size(16.dp)
                        )
                    },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { searchQuery = "" }, modifier = Modifier.size(24.dp)) {
                                Icon(
                                    imageVector = Icons.Rounded.Close,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                    modifier = Modifier.size(14.dp)
                                )
                            }
                        }
                    },
                    singleLine = true,
                    textStyle = LocalTextStyle.current.copy(fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurface),
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.5f),
                        unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f),
                        focusedContainerColor = MaterialTheme.colorScheme.surface,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surface
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(44.dp)
                )
            }
        }

        // Live Log Stream
        if (filteredLogs.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(bottom = 100.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier.padding(24.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Terminal,
                            contentDescription = null,
                            modifier = Modifier.size(28.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                        )
                    }
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = stringResource(id = R.string.run_console_no_logs_title),
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f)
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = stringResource(id = R.string.run_console_no_logs_desc),
                        fontSize = 12.sp,
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                        lineHeight = 16.sp
                    )
                }
            }
        } else {
            LazyColumn(
                state = listState,
                contentPadding = PaddingValues(bottom = 100.dp),
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.6f))
                    .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
            ) {
                itemsIndexed(filteredLogs) { index, line ->
                    ConsoleLogLine(index = index, line = line)
                }
            }
        }
    }
}

@Composable
fun ConsoleLogLine(index: Int, line: String) {
    val cleanLine = line.trim()

    when {
        cleanLine.startsWith("[RRT] Starting execution of suite:") -> {
            val suiteName = cleanLine.replace("[RRT] Starting execution of suite:", "").trim()
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 3.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                    .border(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.3f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 8.dp, vertical = 6.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "${index + 1}",
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                        modifier = Modifier.width(28.dp)
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.25f))
                            .padding(horizontal = 5.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "RRT SUITE",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = suiteName,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        cleanLine.startsWith("[RRT] Running Test Case:") -> {
            val testName = cleanLine.replace("[RRT] Running Test Case:", "").trim()
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 3.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(MaterialTheme.colorScheme.secondary.copy(alpha = 0.12f))
                    .padding(horizontal = 8.dp, vertical = 5.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "${index + 1}",
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                        modifier = Modifier.width(28.dp)
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.secondary.copy(alpha = 0.25f))
                            .padding(horizontal = 5.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "TEST",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.secondary
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = testName,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        cleanLine.startsWith("[Step]") -> {
            val stepText = cleanLine.replace("[Step]", "").trim()
            val isDado = stepText.startsWith("Dado", ignoreCase = true)
            val isQuando = stepText.startsWith("Quando", ignoreCase = true)
            val isEntao = stepText.startsWith("Então", ignoreCase = true) || stepText.startsWith("Entao", ignoreCase = true)
            val isE = stepText.startsWith("E ", ignoreCase = true)

            val (badgeColor, badgeBg) = when {
                isDado -> Color(0xFF06B6D4) to Color(0xFF06B6D4).copy(alpha = 0.15f)
                isQuando -> Color(0xFFF59E0B) to Color(0xFFF59E0B).copy(alpha = 0.15f)
                isEntao -> Color(0xFF10B981) to Color(0xFF10B981).copy(alpha = 0.15f)
                isE -> Color(0xFF6366F1) to Color(0xFF6366F1).copy(alpha = 0.15f)
                else -> MaterialTheme.colorScheme.primary to MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${index + 1}",
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                    modifier = Modifier.width(28.dp)
                )
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(badgeBg)
                        .padding(horizontal = 5.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "STEP",
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        color = badgeColor
                    )
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = stepText,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        cleanLine.startsWith("->") || cleanLine.startsWith("  ->") -> {
            val actionText = cleanLine.replace("->", "").trim()
            val isError = actionText.contains("failed", ignoreCase = true) || actionText.contains("Error", ignoreCase = true)
            val isSuccess = actionText.contains("verified", ignoreCase = true) || actionText.contains("Passed", ignoreCase = true)

            val dotColor = when {
                isError -> MaterialTheme.colorScheme.error
                isSuccess -> Color(0xFF10B981)
                else -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            }

            val textColor = when {
                isError -> MaterialTheme.colorScheme.error
                isSuccess -> Color(0xFF10B981)
                else -> MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f)
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 1.dp)
                    .then(
                        if (isError) Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.error.copy(alpha = 0.1f))
                        else Modifier
                    ),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${index + 1}",
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f),
                    modifier = Modifier.width(28.dp)
                )
                Spacer(modifier = Modifier.width(16.dp))
                Box(
                    modifier = Modifier
                        .size(5.dp)
                        .clip(CircleShape)
                        .background(dotColor)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = actionText,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    color = textColor,
                    fontWeight = if (isError) FontWeight.SemiBold else FontWeight.Normal
                )
            }
        }

        cleanLine.startsWith("[RRT] Test Passed:") -> {
            val testName = cleanLine.replace("[RRT] Test Passed:", "").trim()
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 3.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(Color(0xFF10B981).copy(alpha = 0.15f))
                    .border(1.dp, Color(0xFF10B981).copy(alpha = 0.3f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 8.dp, vertical = 5.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "${index + 1}",
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                        modifier = Modifier.width(28.dp)
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0xFF10B981).copy(alpha = 0.25f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "PASS",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF10B981)
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = testName,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFF10B981)
                    )
                }
            }
        }

        cleanLine.startsWith("[RRT] Test Failed:") -> {
            val testName = cleanLine.replace("[RRT] Test Failed:", "").trim()
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 3.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(MaterialTheme.colorScheme.error.copy(alpha = 0.15f))
                    .border(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.3f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 8.dp, vertical = 5.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "${index + 1}",
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                        modifier = Modifier.width(28.dp)
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.error.copy(alpha = 0.25f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "FAIL",
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = testName,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }

        else -> {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp, vertical = 1.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${index + 1}",
                    fontSize = 10.sp,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.3f),
                    modifier = Modifier.width(28.dp)
                )
                Text(
                    text = line,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f)
                )
            }
        }
    }
}
