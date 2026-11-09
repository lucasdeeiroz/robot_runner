package com.lucasdeeiroz.robotrunner.overlay

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lucasdeeiroz.robotrunner.R
import com.lucasdeeiroz.robotrunner.explorer.AutonomousExplorerEngine
import com.lucasdeeiroz.robotrunner.explorer.ExplorationAction
import com.lucasdeeiroz.robotrunner.explorer.ExplorerState
import com.lucasdeeiroz.robotrunner.ui.theme.RobotRunnerTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun ExplorerOverlayView(
    onClose: () -> Unit,
    onOpenApp: () -> Unit,
    onDrag: (Float, Float) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var isExpanded by remember { mutableStateOf(false) }
    val report by AutonomousExplorerEngine.reportFlow.collectAsState()
    var lastInteractionTime by remember { mutableStateOf(System.currentTimeMillis()) }

    var isActive by remember { mutableStateOf(true) }

    LaunchedEffect(lastInteractionTime) {
        isActive = true
        delay(6000)
        isActive = false
    }

    val currentAlpha by animateFloatAsState(targetValue = if (isActive) 1f else 0.6f, label = "alpha")

    RobotRunnerTheme {
        Surface(
            modifier = Modifier
                .width(if (isExpanded) 310.dp else 230.dp)
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
            shadowElevation = 10.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f))
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
                                lastInteractionTime = System.currentTimeMillis()
                            }
                        }
                        .background(MaterialTheme.colorScheme.primaryContainer)
                        .padding(horizontal = 8.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Explore,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onPrimaryContainer,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = stringResource(id = R.string.title_explorer_overlay),
                            color = MaterialTheme.colorScheme.onPrimaryContainer,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(
                            onClick = {
                                isExpanded = !isExpanded
                                lastInteractionTime = System.currentTimeMillis()
                            },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                imageVector = if (isExpanded) Icons.Rounded.ExpandLess else Icons.Rounded.ExpandMore,
                                contentDescription = if (isExpanded) stringResource(id = R.string.desc_collapse) else stringResource(id = R.string.desc_expand),
                                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        IconButton(
                            onClick = onOpenApp,
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.OpenInNew,
                                contentDescription = stringResource(id = R.string.desc_open_app),
                                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.size(14.dp)
                            )
                        }

                        IconButton(
                            onClick = onClose,
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = stringResource(id = R.string.btn_close),
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(14.dp)
                            )
                        }
                    }
                }

                // Body Content
                Column(modifier = Modifier.padding(10.dp)) {
                    // Status Badge & Controls Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        ExplorerOverlayStateBadge(state = report.currentState)

                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            if (report.currentState != ExplorerState.RUNNING) {
                                IconButton(
                                    onClick = {
                                        AutonomousExplorerEngine.startExploration()
                                        lastInteractionTime = System.currentTimeMillis()
                                    },
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Surface(
                                        color = MaterialTheme.colorScheme.primary,
                                        shape = RoundedCornerShape(6.dp),
                                        modifier = Modifier.fillMaxSize()
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                imageVector = Icons.Rounded.PlayArrow,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.onPrimary,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            } else {
                                IconButton(
                                    onClick = {
                                        AutonomousExplorerEngine.pauseExploration()
                                        lastInteractionTime = System.currentTimeMillis()
                                    },
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Surface(
                                        color = MaterialTheme.colorScheme.secondary,
                                        shape = RoundedCornerShape(6.dp),
                                        modifier = Modifier.fillMaxSize()
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                imageVector = Icons.Rounded.Pause,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.onSecondary,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }

                            if (report.currentState == ExplorerState.RUNNING || report.currentState == ExplorerState.PAUSED) {
                                IconButton(
                                    onClick = {
                                        AutonomousExplorerEngine.stopExploration()
                                        lastInteractionTime = System.currentTimeMillis()
                                    },
                                    modifier = Modifier.size(28.dp)
                                ) {
                                    Surface(
                                        color = MaterialTheme.colorScheme.error,
                                        shape = RoundedCornerShape(6.dp),
                                        modifier = Modifier.fillMaxSize()
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                imageVector = Icons.Rounded.Stop,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.onError,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Stats Snapshot Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(text = stringResource(id = R.string.label_visited_screens), fontSize = 8.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                                Text(text = "${report.visitedScreensCount}", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            }
                        }

                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(text = stringResource(id = R.string.label_total_actions), fontSize = 8.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                                Text(text = "${report.totalActionsCount}", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.secondary)
                            }
                        }

                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Text(text = stringResource(id = R.string.label_dead_ends), fontSize = 8.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                                Text(text = "${report.deadEndsHandled}", fontSize = 14.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                            }
                        }
                    }

                    // Expanded Section: Live Action Ticker & Map Export
                    AnimatedVisibility(visible = isExpanded) {
                        Column(modifier = Modifier.padding(top = 8.dp)) {
                            HorizontalDivider(
                                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f),
                                modifier = Modifier.padding(vertical = 4.dp)
                            )

                            Text(
                                text = stringResource(id = R.string.header_action_ticker),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Spacer(modifier = Modifier.height(4.dp))

                            if (report.actionLog.isEmpty()) {
                                Text(
                                    text = stringResource(id = R.string.empty_action_ticker),
                                    fontSize = 10.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                                )
                            } else {
                                LazyColumn(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .heightIn(max = 140.dp),
                                    verticalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    items(report.actionLog.reversed().take(8)) { action ->
                                        OverlayActionTickerItem(action = action)
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            // Bottom Buttons Row in Expanded Mode
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                OutlinedButton(
                                    onClick = {
                                        AutonomousExplorerEngine.resetState()
                                        lastInteractionTime = System.currentTimeMillis()
                                    },
                                    modifier = Modifier.weight(1f),
                                    contentPadding = PaddingValues(vertical = 4.dp),
                                    shape = RoundedCornerShape(8.dp)
                                ) {
                                    Text(text = stringResource(id = R.string.btn_reset_exploration), fontSize = 10.sp)
                                }

                                Button(
                                    onClick = {
                                        coroutineScope.launch {
                                            val file = AutonomousExplorerEngine.exportExplorationMapJson()
                                            if (file != null) {
                                                Toast.makeText(
                                                    context,
                                                    context.getString(R.string.msg_dfs_map_exported, file.name),
                                                    Toast.LENGTH_LONG
                                                ).show()
                                            }
                                        }
                                        lastInteractionTime = System.currentTimeMillis()
                                    },
                                    enabled = report.discoveredScreens.isNotEmpty(),
                                    modifier = Modifier.weight(1f),
                                    contentPadding = PaddingValues(vertical = 4.dp),
                                    shape = RoundedCornerShape(8.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiary)
                                ) {
                                    Icon(imageVector = Icons.Rounded.Download, contentDescription = null, modifier = Modifier.size(12.dp))
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Text(text = stringResource(id = R.string.btn_export_dfs_map), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ExplorerOverlayStateBadge(state: ExplorerState) {
    val (bgColor, textColor, labelRes) = when (state) {
        ExplorerState.IDLE -> Triple(
            MaterialTheme.colorScheme.surfaceVariant,
            MaterialTheme.colorScheme.onSurfaceVariant,
            R.string.explorer_state_idle
        )
        ExplorerState.RUNNING -> Triple(
            MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
            MaterialTheme.colorScheme.primary,
            R.string.explorer_state_running
        )
        ExplorerState.PAUSED -> Triple(
            MaterialTheme.colorScheme.secondary.copy(alpha = 0.15f),
            MaterialTheme.colorScheme.secondary,
            R.string.explorer_state_paused
        )
        ExplorerState.EXHAUSTED -> Triple(
            MaterialTheme.colorScheme.tertiary.copy(alpha = 0.15f),
            MaterialTheme.colorScheme.tertiary,
            R.string.explorer_state_exhausted
        )
        ExplorerState.STOPPED -> Triple(
            MaterialTheme.colorScheme.error.copy(alpha = 0.15f),
            MaterialTheme.colorScheme.error,
            R.string.explorer_state_stopped
        )
    }

    Surface(
        color = bgColor,
        shape = RoundedCornerShape(6.dp),
        border = BorderStroke(1.dp, textColor.copy(alpha = 0.3f))
    ) {
        Text(
            text = stringResource(id = labelRes),
            color = textColor,
            fontSize = 9.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
        )
    }
}

@Composable
fun OverlayActionTickerItem(action: ExplorationAction) {
    val isClick = action.actionType.startsWith("CLICK")
    val isBack = action.actionType == "BACK"
    val actionColor = if (isClick) MaterialTheme.colorScheme.primary else if (isBack) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.tertiary

    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
        shape = RoundedCornerShape(6.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 6.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = "[${action.actionType}]",
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    color = actionColor
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = action.targetElementName,
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Text(
                text = action.screenId.takeLast(10),
                fontSize = 8.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}
