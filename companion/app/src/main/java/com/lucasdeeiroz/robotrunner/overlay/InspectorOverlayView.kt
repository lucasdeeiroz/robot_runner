package com.lucasdeeiroz.robotrunner.overlay

import android.widget.Toast
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lucasdeeiroz.robotrunner.R
import com.lucasdeeiroz.robotrunner.inspector.InspectedElement
import com.lucasdeeiroz.robotrunner.inspector.RecordedStep
import com.lucasdeeiroz.robotrunner.inspector.UiInspectorEngine
import com.lucasdeeiroz.robotrunner.ui.theme.RobotRunnerTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

@Composable
fun InspectorOverlayView(
    onClose: () -> Unit,
    onOpenApp: () -> Unit,
    onDrag: (Float, Float) -> Unit
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val coroutineScope = rememberCoroutineScope()

    var isExpanded by remember { mutableStateOf(false) }
    var capturedElements by remember { mutableStateOf<List<InspectedElement>>(emptyList()) }
    var recordedSteps by remember { mutableStateOf<List<RecordedStep>>(emptyList()) }
    var lastInteractionTime by remember { mutableStateOf(System.currentTimeMillis()) }

    LaunchedEffect(Unit) {
        while (true) {
            capturedElements = UiInspectorEngine.getCapturedElementsSnapshot()
            recordedSteps = UiInspectorEngine.recordedStepsFlow.value
            delay(1000)
        }
    }

    var isActive by remember { mutableStateOf(true) }

    LaunchedEffect(lastInteractionTime) {
        isActive = true
        delay(6000)
        isActive = false
    }

    val currentAlpha by animateFloatAsState(targetValue = if (isActive) 1f else 0.55f, label = "alpha")

    RobotRunnerTheme {
        Surface(
            modifier = Modifier
                .width(if (isExpanded) 320.dp else 220.dp)
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
            shape = RoundedCornerShape(14.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.95f),
            shadowElevation = 10.dp
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
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        IconButton(
                            onClick = {
                                isExpanded = !isExpanded
                                lastInteractionTime = System.currentTimeMillis()
                            },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                imageVector = if (isExpanded) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown,
                                contentDescription = if (isExpanded) stringResource(id = R.string.desc_collapse) else stringResource(id = R.string.desc_expand),
                                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        Text(
                            text = stringResource(id = R.string.title_inspector_overlay),
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        // Quick Capture Button
                        IconButton(
                            onClick = {
                                lastInteractionTime = System.currentTimeMillis()
                                val captured = UiInspectorEngine.captureActiveUiTree()
                                capturedElements = captured
                                Toast.makeText(context, context.getString(R.string.inspector_overlay_nodes_toast, captured.size), Toast.LENGTH_SHORT).show()
                            },
                            modifier = Modifier.size(26.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.CameraAlt,
                                contentDescription = stringResource(id = R.string.btn_capture_ui),
                                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        IconButton(
                            onClick = onOpenApp,
                            modifier = Modifier.size(26.dp)
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.OpenInNew,
                                contentDescription = stringResource(id = R.string.desc_open_app),
                                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.size(15.dp)
                            )
                        }

                        IconButton(
                            onClick = onClose,
                            modifier = Modifier.size(26.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = stringResource(id = R.string.btn_close),
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }

                // Compact Content View
                if (!isExpanded) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = stringResource(id = R.string.inspector_overlay_nodes_captured, capturedElements.size),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            val topElement = capturedElements.firstOrNull { it.name.isNotBlank() }
                            Text(
                                text = topElement?.name ?: stringResource(id = R.string.inspector_overlay_tap_to_capture),
                                fontSize = 10.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }

                        Button(
                            onClick = {
                                lastInteractionTime = System.currentTimeMillis()
                                val captured = UiInspectorEngine.captureActiveUiTree()
                                capturedElements = captured
                                Toast.makeText(context, context.getString(R.string.inspector_overlay_nodes_toast, captured.size), Toast.LENGTH_SHORT).show()
                            },
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                            modifier = Modifier.height(28.dp)
                        ) {
                            Text(text = stringResource(id = R.string.btn_capture_ui), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                } else {
                    // Expanded Mode: List of captured elements with instant locator copy & step record
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(8.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = stringResource(id = R.string.inspector_overlay_interactive_nodes, capturedElements.size),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )

                            if (recordedSteps.isNotEmpty()) {
                                Surface(
                                    color = MaterialTheme.colorScheme.error.copy(alpha = 0.15f),
                                    shape = RoundedCornerShape(6.dp)
                                ) {
                                    Text(
                                        text = stringResource(id = R.string.inspector_overlay_steps_count, recordedSteps.size),
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.error,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                        }

                        if (capturedElements.isEmpty()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 16.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = stringResource(id = R.string.inspector_overlay_tap_capture_hint),
                                    fontSize = 10.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        } else {
                            LazyColumn(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(max = 240.dp),
                                verticalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                items(capturedElements.take(40)) { el ->
                                    val bestLocator = el.accessibilityId.ifBlank { el.resourceId }.ifBlank { el.xpath }
                                    Surface(
                                        color = MaterialTheme.colorScheme.surfaceVariant,
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .padding(6.dp),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Row(
                                                    verticalAlignment = Alignment.CenterVertically,
                                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                                ) {
                                                    val badgeColor = when {
                                                        el.isEditable -> Color(0xFF0284C7)
                                                        el.isClickable -> Color(0xFF6366F1)
                                                        el.className.contains("Image", ignoreCase = true) -> Color(0xFFEC4899)
                                                        el.text.isNotBlank() -> Color(0xFF10B981)
                                                        else -> Color(0xFF64748B)
                                                    }
                                                    Surface(
                                                        color = badgeColor.copy(alpha = 0.2f),
                                                        shape = RoundedCornerShape(4.dp)
                                                    ) {
                                                        Text(
                                                            text = if (el.isEditable) "INPUT" else if (el.isClickable) "BTN" else "VIEW",
                                                            fontSize = 8.sp,
                                                            fontWeight = FontWeight.Bold,
                                                            color = badgeColor,
                                                            modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                                                        )
                                                    }

                                                    Text(
                                                        text = el.name,
                                                        fontSize = 11.sp,
                                                        fontWeight = FontWeight.SemiBold,
                                                        color = MaterialTheme.colorScheme.onSurface,
                                                        maxLines = 1,
                                                        overflow = TextOverflow.Ellipsis
                                                    )
                                                }

                                                Text(
                                                    text = bestLocator,
                                                    fontSize = 9.sp,
                                                    fontFamily = FontFamily.Monospace,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }

                                            Row {
                                                // Copy Locator
                                                IconButton(
                                                    onClick = {
                                                        clipboardManager.setText(AnnotatedString(bestLocator))
                                                        Toast.makeText(context, context.getString(R.string.inspector_copied_toast), Toast.LENGTH_SHORT).show()
                                                        lastInteractionTime = System.currentTimeMillis()
                                                    },
                                                    modifier = Modifier.size(24.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Rounded.ContentCopy,
                                                        contentDescription = stringResource(id = R.string.inspector_copy_locator),
                                                        tint = MaterialTheme.colorScheme.primary,
                                                        modifier = Modifier.size(13.dp)
                                                    )
                                                }

                                                // Record Tap
                                                IconButton(
                                                    onClick = {
                                                        UiInspectorEngine.addRecordedStep(
                                                            RecordedStep(
                                                                id = UUID.randomUUID().toString(),
                                                                actionType = "click",
                                                                elementName = el.name,
                                                                locator = bestLocator
                                                            )
                                                        )
                                                        recordedSteps = UiInspectorEngine.recordedStepsFlow.value
                                                        Toast.makeText(context, context.getString(R.string.inspector_msg_step_added, "Click on ${el.name}"), Toast.LENGTH_SHORT).show()
                                                        lastInteractionTime = System.currentTimeMillis()
                                                    },
                                                    modifier = Modifier.size(24.dp)
                                                ) {
                                                    Icon(
                                                        imageVector = Icons.Rounded.TouchApp,
                                                        contentDescription = stringResource(id = R.string.inspector_action_click),
                                                        tint = MaterialTheme.colorScheme.error,
                                                        modifier = Modifier.size(13.dp)
                                                    )
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Bottom Toolbar in Expanded Mode
                        if (recordedSteps.isNotEmpty()) {
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                TextButton(
                                    onClick = {
                                        val snippet = UiInspectorEngine.generateRobotSnippet()
                                        if (snippet.isNotEmpty()) {
                                            clipboardManager.setText(AnnotatedString(snippet))
                                            val isConnectedToDesktop = com.lucasdeeiroz.robotrunner.sync.DesktopSyncManager.hostState.value != null
                                            if (isConnectedToDesktop) {
                                                UiInspectorEngine.queueSnippetForDesktop(snippet)
                                                Toast.makeText(context, context.getString(R.string.inspector_msg_snippet_sent_to_desktop), Toast.LENGTH_SHORT).show()
                                            } else {
                                                coroutineScope.launch {
                                                    val file = UiInspectorEngine.exportRobotSnippetToFile()
                                                    if (file != null) {
                                                        Toast.makeText(context, context.getString(R.string.inspector_msg_snippet_saved_downloads, file.name), Toast.LENGTH_LONG).show()
                                                    } else {
                                                        Toast.makeText(context, context.getString(R.string.inspector_msg_robot_copied), Toast.LENGTH_SHORT).show()
                                                    }
                                                }
                                            }
                                        }
                                        lastInteractionTime = System.currentTimeMillis()
                                    },
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Icon(imageVector = Icons.Rounded.ContentCopy, contentDescription = null, modifier = Modifier.size(12.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(text = stringResource(id = R.string.inspector_overlay_copy_robot, recordedSteps.size), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                }

                                TextButton(
                                    onClick = {
                                        UiInspectorEngine.clearRecordedSteps()
                                        recordedSteps = emptyList()
                                        lastInteractionTime = System.currentTimeMillis()
                                    },
                                    contentPadding = PaddingValues(horizontal = 6.dp, vertical = 2.dp),
                                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                                ) {
                                    Text(text = stringResource(id = R.string.inspector_btn_clear_steps), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
