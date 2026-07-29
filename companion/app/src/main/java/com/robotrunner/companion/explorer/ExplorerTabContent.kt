package com.robotrunner.companion.explorer

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.layout.*
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
import com.robotrunner.companion.R
import com.robotrunner.companion.performance.FloatingHudService
import kotlinx.coroutines.launch

@Composable
fun ExplorerTabContent() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    val report by AutonomousExplorerEngine.reportFlow.collectAsState()
    var targetPackageInput by remember { mutableStateOf(AutonomousExplorerEngine.targetPackageName ?: "") }
    var isHudRunning by remember { mutableStateOf(FloatingHudService.isRunning && FloatingHudService.activeMode == FloatingHudService.MODE_EXPLORER) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Floating HUD Overlay Control Card for Explorer
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
                        text = "🖥️ Explorer Floating HUD Overlay",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Control and stop exploration overlay directly on target app",
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
                                putExtra(FloatingHudService.EXTRA_HUD_MODE, FloatingHudService.MODE_EXPLORER)
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

        // Target App Configuration & Control Header Card
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
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = stringResource(id = R.string.header_autonomous_explorer),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = stringResource(id = R.string.desc_autonomous_explorer),
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    ExplorerStateBadge(state = report.currentState)
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Target Package Name Selector Input
                OutlinedTextField(
                    value = targetPackageInput,
                    onValueChange = { targetPackageInput = it },
                    label = { Text(text = "Target App Package (e.g. com.positivo.casainteligente)", fontSize = 12.sp) },
                    placeholder = { Text(text = "Leave empty to explore active foreground app", fontSize = 12.sp) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFF6366F1),
                        unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                        focusedContainerColor = MaterialTheme.colorScheme.surface,
                        unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                        focusedTextColor = MaterialTheme.colorScheme.onSurface,
                        unfocusedTextColor = MaterialTheme.colorScheme.onSurface
                    ),
                    shape = RoundedCornerShape(10.dp),
                    singleLine = true
                )

                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = { AutonomousExplorerEngine.startExploration(targetPackageInput.ifBlank { null }) },
                        enabled = report.currentState != ExplorerState.RUNNING,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF22C55E)),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(text = stringResource(id = R.string.btn_start_exploration), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = { AutonomousExplorerEngine.pauseExploration() },
                        enabled = report.currentState == ExplorerState.RUNNING,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF59E0B)),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(text = stringResource(id = R.string.btn_pause_exploration), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = { AutonomousExplorerEngine.stopExploration() },
                        enabled = report.currentState == ExplorerState.RUNNING || report.currentState == ExplorerState.PAUSED,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(text = stringResource(id = R.string.btn_stop_exploration), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    OutlinedButton(
                        onClick = {
                            AutonomousExplorerEngine.resetState()
                            targetPackageInput = ""
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(text = stringResource(id = R.string.btn_reset_exploration), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }

                    Button(
                        onClick = {
                            coroutineScope.launch {
                                val file = AutonomousExplorerEngine.exportExplorationMapJson()
                                if (file != null) {
                                    Toast.makeText(context, context.getString(R.string.msg_dfs_map_exported, file.name), Toast.LENGTH_LONG).show()
                                }
                            }
                        },
                        enabled = report.discoveredScreens.isNotEmpty(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(text = stringResource(id = R.string.btn_export_dfs_map), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Stats Gauge Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            ExplorerGaugeCard(
                title = stringResource(id = R.string.label_visited_screens),
                value = "${report.visitedScreensCount}",
                color = Color(0xFF38BDF8),
                modifier = Modifier.weight(1f)
            )
            ExplorerGaugeCard(
                title = stringResource(id = R.string.label_total_actions),
                value = "${report.totalActionsCount}",
                color = Color(0xFF6366F1),
                modifier = Modifier.weight(1f)
            )
            ExplorerGaugeCard(
                title = stringResource(id = R.string.label_dead_ends),
                value = "${report.deadEndsHandled}",
                color = Color(0xFFF43F5E),
                modifier = Modifier.weight(1f)
            )
        }

        // Discovered Screens Graph Table Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Discovered Screens Graph (${report.discoveredScreens.size})",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(10.dp))

                if (report.discoveredScreens.isEmpty()) {
                    Text(text = "No screens crawled yet. Tap Start Exploration.", fontSize = 12.sp, color = Color(0xFF64748B))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        report.discoveredScreens.forEach { screen ->
                            ScreenNodeCard(screenNode = screen)
                        }
                    }
                }
            }
        }

        // Recent Action Stream Ticker
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Action Stream Ticker (DFS Clicks & BACK)",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(10.dp))

                if (report.actionLog.isEmpty()) {
                    Text(text = "Listening for exploration actions...", fontSize = 12.sp, color = Color(0xFF64748B))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        report.actionLog.reversed().forEach { act ->
                            ActionTickerItem(action = act)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ExplorerStateBadge(state: ExplorerState) {
    val (bgColor, textColor, label) = when (state) {
        ExplorerState.IDLE -> Triple(MaterialTheme.colorScheme.outlineVariant, MaterialTheme.colorScheme.onSurfaceVariant, "IDLE")
        ExplorerState.RUNNING -> Triple(Color(0xFF166534), Color(0xFF4ADE80), "RUNNING")
        ExplorerState.PAUSED -> Triple(Color(0xFF854D0E), Color(0xFFFDE047), "PAUSED")
        ExplorerState.EXHAUSTED -> Triple(Color(0xFF1E1B4B), Color(0xFFA78BFA), "EXHAUSTED")
        ExplorerState.STOPPED -> Triple(Color(0xFF991B1B), Color(0xFFFCA5A5), "STOPPED")
    }

    Surface(
        color = bgColor,
        shape = RoundedCornerShape(6.dp)
    ) {
        Text(
            text = label,
            color = textColor,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
fun ExplorerGaugeCard(
    title: String,
    value: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(text = title, fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(text = value, fontSize = 20.sp, fontWeight = FontWeight.Bold, color = color)
        }
    }
}

@Composable
fun ScreenNodeCard(screenNode: ScreenNode) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(text = screenNode.screenName, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF38BDF8))
                Text(
                    text = "ID: ${screenNode.screenId} | ${screenNode.elements.size} elements",
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = FontFamily.Monospace
                )
            }
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(6.dp)
            ) {
                Text(
                    text = "${screenNode.visitCount} visits",
                    fontSize = 10.sp,
                    color = Color(0xFFA78BFA),
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
fun ActionTickerItem(action: ExplorationAction) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(6.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "[${action.actionType}]",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = if (action.actionType.startsWith("CLICK")) Color(0xFF22C55E) else if (action.actionType == "BACK") Color(0xFFF43F5E) else Color(0xFF38BDF8)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = action.targetElementName,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Text(
                text = action.screenId.takeLast(15),
                fontSize = 9.sp,
                color = Color(0xFF64748B),
                fontFamily = FontFamily.Monospace
            )
        }
    }
}
