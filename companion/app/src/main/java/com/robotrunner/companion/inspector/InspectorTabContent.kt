package com.robotrunner.companion.inspector

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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.robotrunner.companion.R
import com.robotrunner.companion.performance.FloatingHudService
import kotlinx.coroutines.launch

@Composable
fun InspectorTabContent() {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val coroutineScope = rememberCoroutineScope()

    val liveElements by UiInspectorEngine.capturedElementsFlow.collectAsState()
    var searchQuery by remember { mutableStateOf("") }
    var isHudRunning by remember { mutableStateOf(FloatingHudService.isRunning) }

    val elements = remember(liveElements) {
        if (liveElements.isNotEmpty()) liveElements else UiInspectorEngine.getCapturedElementsSnapshot()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
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
                        text = stringResource(id = R.string.header_floating_hud_inspector),
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = stringResource(id = R.string.desc_floating_hud_inspector),
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
                                putExtra(FloatingHudService.EXTRA_HUD_MODE, FloatingHudService.MODE_INSPECTOR)
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

        // Active Screen Capture Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = stringResource(id = R.string.header_ui_inspector),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = stringResource(id = R.string.desc_ui_inspector),
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(14.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = {
                            val captured = UiInspectorEngine.captureActiveUiTree()
                            if (captured.isEmpty()) {
                                Toast.makeText(context, "No active Accessibility window root node found", Toast.LENGTH_SHORT).show()
                            }
                        },
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(text = stringResource(id = R.string.btn_capture_ui), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }

                    Button(
                        onClick = {
                            coroutineScope.launch {
                                val file = UiInspectorEngine.exportUiElementMapJson("Active Screen")
                                if (file != null) {
                                    Toast.makeText(context, context.getString(R.string.msg_ui_map_exported, file.name), Toast.LENGTH_LONG).show()
                                }
                            }
                        },
                        enabled = elements.isNotEmpty(),
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(text = stringResource(id = R.string.btn_export_ui_map), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Search Filter Bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            placeholder = { Text(text = "Search elements by name, locator, or class...", fontSize = 13.sp) },
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

        // Inspected Elements List
        val filteredElements = elements.filter { el ->
            searchQuery.isBlank() ||
                    el.name.contains(searchQuery, ignoreCase = true) ||
                    el.accessibilityId.contains(searchQuery, ignoreCase = true) ||
                    el.resourceId.contains(searchQuery, ignoreCase = true) ||
                    el.className.contains(searchQuery, ignoreCase = true)
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = "Captured Interactive Elements (${filteredElements.size})",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )

                Spacer(modifier = Modifier.height(10.dp))

                if (filteredElements.isEmpty()) {
                    Text(text = "No elements captured yet. Tap Capture Screen UI.", fontSize = 12.sp, color = Color(0xFF64748B))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        filteredElements.take(50).forEach { el ->
                            InspectedElementCard(
                                element = el,
                                onCopyLocator = { loc ->
                                    clipboardManager.setText(AnnotatedString(loc))
                                    Toast.makeText(context, "Copied to clipboard!", Toast.LENGTH_SHORT).show()
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun InspectedElementCard(
    element: InspectedElement,
    onCopyLocator: (String) -> Unit
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = element.name, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF38BDF8))
                Text(text = element.bounds, fontSize = 10.sp, color = Color(0xFF64748B), fontFamily = FontFamily.Monospace)
            }

            Spacer(modifier = Modifier.height(4.dp))

            Text(text = "Class: ${element.className}", fontSize = 10.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)

            if (element.accessibilityId.isNotBlank()) {
                LocatorRow(label = "accessibilityId", locator = element.accessibilityId, onCopy = onCopyLocator)
            }
            if (element.resourceId.isNotBlank()) {
                LocatorRow(label = "resourceId", locator = element.resourceId, onCopy = onCopyLocator)
            }
            LocatorRow(label = "UiSelector", locator = element.uiSelector, onCopy = onCopyLocator)
            LocatorRow(label = "XPath", locator = element.xpath, onCopy = onCopyLocator)
        }
    }
}

@Composable
fun LocatorRow(label: String, locator: String, onCopy: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(text = label, fontSize = 9.sp, color = Color(0xFFC084FC), fontWeight = FontWeight.Bold)
            Text(text = locator, fontSize = 10.5.sp, color = MaterialTheme.colorScheme.onSurface, fontFamily = FontFamily.Monospace)
        }
        IconButton(
            onClick = { onCopy(locator) },
            modifier = Modifier.size(24.dp)
        ) {
            Text(text = "📋", fontSize = 11.sp)
        }
    }
}
