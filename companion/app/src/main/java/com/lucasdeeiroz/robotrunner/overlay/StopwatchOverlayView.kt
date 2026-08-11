package com.lucasdeeiroz.robotrunner.overlay

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lucasdeeiroz.robotrunner.stopwatch.LogcatStopwatchEngine
import com.lucasdeeiroz.robotrunner.stopwatch.RedrawStopwatchEngine
import com.lucasdeeiroz.robotrunner.ui.theme.RobotRunnerTheme
import com.lucasdeeiroz.robotrunner.service.CompanionAccessibilityService
import kotlinx.coroutines.delay
import com.lucasdeeiroz.robotrunner.R
import androidx.compose.ui.platform.LocalContext

@Composable
fun StopwatchOverlayView(
    onClose: () -> Unit,
    onOpenApp: () -> Unit,
    onDrag: (Float, Float) -> Unit
) {
    var isRedrawRecording by remember { mutableStateOf<Boolean>(RedrawStopwatchEngine.isRecordingSession) }
    var isLogcatRecording by remember { mutableStateOf<Boolean>(LogcatStopwatchEngine.isRecordingSession) }
    
    var lastRedrawDelta by remember { mutableStateOf<Long>(CompanionAccessibilityService.lastFrameRedrawDeltaMs) }
    var logcatLaps by remember { mutableStateOf(LogcatStopwatchEngine.getLapsSnapshot()) }

    LaunchedEffect(Unit) {
        while (true) {
            isRedrawRecording = RedrawStopwatchEngine.isRecordingSession
            isLogcatRecording = LogcatStopwatchEngine.isRecordingSession
            lastRedrawDelta = CompanionAccessibilityService.lastFrameRedrawDeltaMs
            logcatLaps = LogcatStopwatchEngine.getLapsSnapshot()
            delay(500)
        }
    }

    RobotRunnerTheme {
        Surface(
            modifier = Modifier
                .width(280.dp)
                .wrapContentHeight(),
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
                            detectDragGestures { change, dragAmount ->
                                change.consume()
                                onDrag(dragAmount.x, dragAmount.y)
                            }
                        }
                        .background(MaterialTheme.colorScheme.primaryContainer)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = LocalContext.current.getString(R.string.title_stopwatch_hud),
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 4.dp)
                    )
                    
                    Row {
                        IconButton(
                            onClick = onOpenApp,
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.OpenInNew,
                                contentDescription = LocalContext.current.getString(R.string.desc_open_app),
                                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        IconButton(
                            onClick = onClose,
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = LocalContext.current.getString(R.string.desc_close),
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }

                Column(modifier = Modifier.padding(12.dp)) {
                    if (isRedrawRecording) {
                        Text(
                            text = LocalContext.current.getString(R.string.label_redraw_tti),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "${if (lastRedrawDelta > 0) lastRedrawDelta else 0} ms",
                            fontSize = 32.sp,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            color = if (lastRedrawDelta < 50) MaterialTheme.colorScheme.primary else if (lastRedrawDelta < 200) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = {
                                val now = System.currentTimeMillis()
                                val touchTs = if (CompanionAccessibilityService.lastTouchTimestamp > 0) CompanionAccessibilityService.lastTouchTimestamp else now - (if (lastRedrawDelta > 0) lastRedrawDelta else 16L)
                                RedrawStopwatchEngine.recordLap(
                                    touchTimestamp = touchTs,
                                    redrawTimestamp = now,
                                    deltaMs = if (lastRedrawDelta > 0) lastRedrawDelta else 16L,
                                    packageName = CompanionAccessibilityService.activePackageName ?: "unknown",
                                    actionType = "hud_split"
                                )
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(4.dp)
                        ) {
                            Text(text = LocalContext.current.getString(R.string.btn_record_split), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    
                    if (isRedrawRecording && isLogcatRecording) {
                        Divider(modifier = Modifier.padding(vertical = 12.dp))
                    }
                    
                    if (isLogcatRecording) {
                        Text(
                            text = LocalContext.current.getString(R.string.label_logcat_watcher),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.secondary
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        if (logcatLaps.isEmpty()) {
                            Text(text = LocalContext.current.getString(R.string.msg_waiting_keywords), fontSize = 11.sp, color = Color.Gray)
                        } else {
                            val lastLap = logcatLaps.last()
                            Text(
                                text = "${lastLap.deltaMs} ms",
                                fontSize = 32.sp,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = LocalContext.current.getString(R.string.label_keyword_format, lastLap.keyword),
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    
                    if (!isRedrawRecording && !isLogcatRecording) {
                        Text(
                            text = LocalContext.current.getString(R.string.msg_no_stopwatch_session),
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
