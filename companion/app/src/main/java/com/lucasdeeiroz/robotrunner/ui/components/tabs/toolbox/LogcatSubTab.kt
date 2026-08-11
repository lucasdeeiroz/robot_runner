package com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox

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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
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
import com.lucasdeeiroz.robotrunner.logcat.LogcatMessage
import com.lucasdeeiroz.robotrunner.logcat.LogcatStreamer
import com.lucasdeeiroz.robotrunner.logcat.LogLevel
import com.lucasdeeiroz.robotrunner.performance.FloatingHudService
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

object LogcatUiCache {
    var searchQuery = ""
    var selectedLevel = LogLevel.VERBOSE
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LogcatSubTab() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var searchQuery by remember { mutableStateOf(LogcatUiCache.searchQuery) }
    var selectedLevel by remember { mutableStateOf(LogcatUiCache.selectedLevel) }
    var isStreaming by remember { mutableStateOf(LogcatStreamer.isStreaming) }
    var logs by remember { mutableStateOf<List<LogcatMessage>>(emptyList()) }
    var isHudRunning by remember { mutableStateOf(FloatingHudService.isRunning) }

    LaunchedEffect(searchQuery, selectedLevel) {
        LogcatUiCache.searchQuery = searchQuery
        LogcatUiCache.selectedLevel = selectedLevel
    }

    LaunchedEffect(Unit) {
        while (true) {
            isHudRunning = FloatingHudService.isRunning
            logs = LogcatStreamer.getFilteredLogs(selectedLevel, searchQuery)
            isStreaming = LogcatStreamer.isStreaming
            delay(500)
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            // Keep streamer state as is on tab switch
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(bottom = 75.dp),
    ) {
        // Overlay HUD Toggle Header Card
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 8.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(id = R.string.header_floating_hud_logcat),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = stringResource(id = R.string.desc_floating_hud_logcat),
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
                                putExtra(FloatingHudService.EXTRA_HUD_MODE, FloatingHudService.MODE_LOGCAT)
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
                        containerColor = if (isHudRunning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = if (isHudRunning) stringResource(id = R.string.btn_stop_hud) else stringResource(id = R.string.btn_start_hud),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (isHudRunning) MaterialTheme.colorScheme.onError else MaterialTheme.colorScheme.onPrimary
                    )
                }
            }
        }

        // Search & Filter Bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text(text = stringResource(id = R.string.search_logcat_placeholder), fontSize = 13.sp) },
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 8.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = MaterialTheme.colorScheme.primary,
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                focusedTextColor = MaterialTheme.colorScheme.onSurface,
                unfocusedTextColor = MaterialTheme.colorScheme.onSurface
            ),
            shape = RoundedCornerShape(10.dp),
            singleLine = true
        )

        // Level Filter Chips & Control Buttons
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                modifier = Modifier.weight(1f).horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                FilterChip(
                    selected = selectedLevel == LogLevel.VERBOSE,
                    onClick = { selectedLevel = LogLevel.VERBOSE },
                    label = { Text(text = stringResource(id = R.string.log_level_all), fontSize = 10.sp) }
                )
                FilterChip(
                    selected = selectedLevel == LogLevel.INFO,
                    onClick = { selectedLevel = LogLevel.INFO },
                    label = { Text(text = stringResource(id = R.string.log_level_info), fontSize = 10.sp) }
                )
                FilterChip(
                    selected = selectedLevel == LogLevel.WARN,
                    onClick = { selectedLevel = LogLevel.WARN },
                    label = { Text(text = stringResource(id = R.string.log_level_warn), fontSize = 10.sp) }
                )
                FilterChip(
                    selected = selectedLevel == LogLevel.ERROR,
                    onClick = { selectedLevel = LogLevel.ERROR },
                    label = { Text(text = stringResource(id = R.string.log_level_err), fontSize = 10.sp) }
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                IconButton(
                    onClick = {
                        if (isStreaming) {
                            LogcatStreamer.stopStreaming()
                            isStreaming = false
                        } else {
                            LogcatStreamer.startStreaming()
                            isStreaming = true
                        }
                    }
                ) {
                    Icon(
                        imageVector = if (isStreaming) Icons.Rounded.Stop else Icons.Rounded.PlayArrow,
                        contentDescription = stringResource(id = R.string.desc_start_stop_logcat),
                        tint = MaterialTheme.colorScheme.onSurface
                    )
                }

                IconButton(
                    onClick = { LogcatStreamer.clearLogs() }
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Delete,
                        contentDescription = stringResource(id = R.string.desc_clear_logcat),
                        tint = MaterialTheme.colorScheme.onSurface
                    )
                }

                IconButton(
                    onClick = {
                        coroutineScope.launch {
                            val file = LogcatStreamer.exportLogs()
                            if (file != null) {
                                Toast.makeText(context, context.getString(R.string.msg_logcat_exported, file.name), Toast.LENGTH_LONG).show()
                            }
                        }
                    }
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Save,
                        contentDescription = stringResource(id = R.string.desc_save_logcat),
                        tint = MaterialTheme.colorScheme.onSurface
                    )
                }
                
                IconButton(
                    onClick = {
                        android.util.Log.d("LogcatSubTab", "Overlay button clicked. canDrawOverlays: ${android.provider.Settings.canDrawOverlays(context)}")
                        if (android.provider.Settings.canDrawOverlays(context)) {
                            context.startService(android.content.Intent(context, com.lucasdeeiroz.robotrunner.overlay.LogcatOverlayService::class.java))
                        } else {
                            val intent = android.content.Intent(
                                android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                android.net.Uri.parse("package:${context.packageName}")
                            )
                            context.startActivity(intent)
                        }
                    }
                ) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.OpenInNew,
                        contentDescription = stringResource(id = R.string.desc_open_bubble),
                        tint = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        // Log Entries Stream List
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(8.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.surfaceVariant)
        ) {
            if (!isStreaming && logs.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(id = R.string.msg_logcat_stopped), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else if (logs.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = stringResource(id = R.string.msg_listening_logcat), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(bottom = 100.dp),
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    reverseLayout = true
                ) {
                    items(logs.takeLast(300).reversed()) { msg ->
                        LogcatItemRow(msg = msg)
                    }
                }
            }
        }
    }
}

@Composable
fun LogcatItemRow(msg: LogcatMessage) {
    val levelColor = when (msg.level) {
        LogLevel.ERROR, LogLevel.FATAL -> MaterialTheme.colorScheme.error
        LogLevel.WARN -> MaterialTheme.colorScheme.tertiary
        LogLevel.INFO -> MaterialTheme.colorScheme.primary
        LogLevel.DEBUG -> MaterialTheme.colorScheme.secondary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
    ) {
        Text(
            text = "[${msg.level.name.take(1)}]",
            color = levelColor,
            fontWeight = FontWeight.Bold,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = "${msg.tag}: ",
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.SemiBold,
            fontSize = 11.sp,
            fontFamily = FontFamily.Monospace
        )
        Text(
            text = msg.message,
            color = MaterialTheme.colorScheme.onSurface,
            fontSize = 11.sp,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.weight(1f)
        )
    }
}
