package com.lucasdeeiroz.robotrunner.ui.components.tabs.run

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
import com.lucasdeeiroz.robotrunner.overlay.InspectorOverlayService
import kotlinx.coroutines.launch
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InspectorSubTab() {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val coroutineScope = rememberCoroutineScope()

    val liveElements by UiInspectorEngine.capturedElementsFlow.collectAsState()
    val recordedSteps by UiInspectorEngine.recordedStepsFlow.collectAsState()

    var searchQuery by remember { mutableStateOf("") }
    var selectedFilterChip by remember { mutableIntStateOf(0) } // 0: All, 1: Clickable, 2: Editable, 3: Text
    var isHudRunning by remember { mutableStateOf(InspectorOverlayService.isRunning) }
    var isRecorderMode by remember { mutableStateOf(false) }

    var selectedElementForDetails by remember { mutableStateOf<InspectedElement?>(null) }
    var showInputDialogForElement by remember { mutableStateOf<Pair<InspectedElement, String>?>(null) } // Element, action ("input" | "assert")
    var inputDialogText by remember { mutableStateOf("") }

    val elements = remember(liveElements) {
        if (liveElements.isNotEmpty()) liveElements else UiInspectorEngine.getCapturedElementsSnapshot()
    }

    val filteredElements = remember(elements, searchQuery, selectedFilterChip) {
        elements.filter { el ->
            val matchesQuery = searchQuery.isBlank() ||
                    el.name.contains(searchQuery, ignoreCase = true) ||
                    el.accessibilityId.contains(searchQuery, ignoreCase = true) ||
                    el.resourceId.contains(searchQuery, ignoreCase = true) ||
                    el.className.contains(searchQuery, ignoreCase = true) ||
                    el.xpath.contains(searchQuery, ignoreCase = true)

            val matchesFilter = when (selectedFilterChip) {
                1 -> el.isClickable
                2 -> el.isEditable
                3 -> el.text.isNotBlank() || el.contentDescription.isNotBlank()
                else -> true
            }

            matchesQuery && matchesFilter
        }
    }

    val clickableCount = remember(elements) { elements.count { it.isClickable } }
    val editableCount = remember(elements) { elements.count { it.isEditable } }
    val textCount = remember(elements) { elements.count { it.text.isNotBlank() || it.contentDescription.isNotBlank() } }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Main Header & Action Toolbar Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
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
                    }

                    // Floating HUD Toggle Chip
                    FilterChip(
                        selected = isHudRunning,
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
                                val serviceIntent = Intent(context, InspectorOverlayService::class.java)
                                if (isHudRunning) {
                                    context.stopService(serviceIntent)
                                    isHudRunning = false
                                } else {
                                    context.startService(serviceIntent)
                                    isHudRunning = true
                                }
                            }
                        },
                        label = {
                            Text(
                                text = if (isHudRunning) stringResource(id = R.string.btn_stop_hud) else stringResource(
                                    id = R.string.btn_start_hud
                                ),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Rounded.Layers,
                                contentDescription = null,
                                modifier = Modifier.size(14.dp),
                                tint = if (isHudRunning) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        },
                        shape = RoundedCornerShape(8.dp),
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                            selectedLabelColor = MaterialTheme.colorScheme.primary
                        )
                    )
                }
            }
        }

        // Step Recorder Panel (visible when recorder mode is active or steps exist)
        AnimatedVisibility(
            visible = isRecorderMode || recordedSteps.isNotEmpty(),
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    // Recorder Header Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.FiberManualRecord,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = stringResource(id = R.string.inspector_recorder_title),
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Surface(
                            color = MaterialTheme.colorScheme.error.copy(alpha = 0.15f),
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text(
                                text = "${recordedSteps.size}",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                            )
                        }
                    }

                    // Action Buttons Row (Export .robot & Clear Steps on dedicated row)
                    if (recordedSteps.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Button(
                                onClick = {
                                    val snippet = UiInspectorEngine.generateRobotSnippet()
                                    if (snippet.isNotEmpty()) {
                                        clipboardManager.setText(AnnotatedString(snippet))
                                        val isConnectedToDesktop =
                                            com.lucasdeeiroz.robotrunner.sync.DesktopSyncManager.hostState.value != null
                                        if (isConnectedToDesktop) {
                                            UiInspectorEngine.queueSnippetForDesktop(snippet)
                                            Toast.makeText(
                                                context,
                                                context.getString(R.string.inspector_msg_snippet_sent_to_desktop),
                                                Toast.LENGTH_SHORT
                                            ).show()
                                        } else {
                                            coroutineScope.launch {
                                                val file = UiInspectorEngine.exportRobotSnippetToFile()
                                                if (file != null) {
                                                    Toast.makeText(
                                                        context,
                                                        context.getString(
                                                            R.string.inspector_msg_snippet_saved_downloads,
                                                            file.name
                                                        ),
                                                        Toast.LENGTH_LONG
                                                    ).show()
                                                } else {
                                                    Toast.makeText(
                                                        context,
                                                        context.getString(R.string.inspector_msg_robot_copied),
                                                        Toast.LENGTH_SHORT
                                                    ).show()
                                                }
                                            }
                                        }
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.ContentCopy,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = stringResource(id = R.string.inspector_btn_export_robot),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }

                            OutlinedButton(
                                onClick = {
                                    UiInspectorEngine.clearRecordedSteps()
                                    Toast.makeText(
                                        context,
                                        context.getString(R.string.inspector_msg_steps_cleared),
                                        Toast.LENGTH_SHORT
                                    ).show()
                                },
                                shape = RoundedCornerShape(10.dp),
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                                border = androidx.compose.foundation.BorderStroke(
                                    1.dp,
                                    MaterialTheme.colorScheme.error.copy(alpha = 0.5f)
                                )
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.DeleteOutline,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = stringResource(id = R.string.inspector_btn_clear_steps),
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    if (recordedSteps.isEmpty()) {
                        Text(
                            text = stringResource(id = R.string.inspector_recorder_empty),
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                        )
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            recordedSteps.forEachIndexed { index, step ->
                                Surface(
                                    color = MaterialTheme.colorScheme.surface,
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(10.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(
                                            modifier = Modifier.weight(1f),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                                        ) {
                                            Text(
                                                text = "${index + 1}.",
                                                fontSize = 12.sp,
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.primary
                                            )
                                            val badgeColor = when (step.actionType.lowercase()) {
                                                "click", "tap" -> Color(0xFF6366F1)
                                                "input", "set_text" -> Color(0xFF0284C7)
                                                "assert", "assert_text" -> Color(0xFF10B981)
                                                else -> Color(0xFFEAB308)
                                            }
                                            Surface(
                                                color = badgeColor.copy(alpha = 0.15f),
                                                shape = RoundedCornerShape(6.dp)
                                            ) {
                                                Text(
                                                    text = step.actionType.uppercase(),
                                                    fontSize = 9.sp,
                                                    fontWeight = FontWeight.Bold,
                                                    color = badgeColor,
                                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                )
                                            }
                                            Column {
                                                Text(
                                                    text = step.elementName,
                                                    fontSize = 12.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                    color = MaterialTheme.colorScheme.onSurface,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                                Text(
                                                    text = step.argument?.let { "arg: \"$it\" | loc: ${step.locator}" }
                                                        ?: step.locator,
                                                    fontSize = 10.sp,
                                                    fontFamily = FontFamily.Monospace,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                )
                                            }
                                        }

                                        IconButton(
                                            onClick = { UiInspectorEngine.deleteRecordedStep(step.id) },
                                            modifier = Modifier.size(28.dp)
                                        ) {
                                            Icon(
                                                imageVector = Icons.Rounded.Close,
                                                contentDescription = null,
                                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Search Bar & Filter Chips
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = {
                    Text(text = stringResource(id = R.string.inspector_search_placeholder), fontSize = 12.sp)
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Rounded.Search,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(
                                imageVector = Icons.Rounded.Clear,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    focusedTextColor = MaterialTheme.colorScheme.onSurface,
                    unfocusedTextColor = MaterialTheme.colorScheme.onSurface
                ),
                shape = RoundedCornerShape(12.dp),
                singleLine = true
            )

            // Filter Chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                FilterChip(
                    selected = selectedFilterChip == 0,
                    onClick = { selectedFilterChip = 0 },
                    label = {
                        Text(
                            text = stringResource(id = R.string.inspector_chip_all, elements.size),
                            fontSize = 11.sp
                        )
                    },
                    shape = RoundedCornerShape(8.dp)
                )
                FilterChip(
                    selected = selectedFilterChip == 1,
                    onClick = { selectedFilterChip = 1 },
                    label = {
                        Text(
                            text = stringResource(id = R.string.inspector_chip_clickable, clickableCount),
                            fontSize = 11.sp
                        )
                    },
                    shape = RoundedCornerShape(8.dp)
                )
                FilterChip(
                    selected = selectedFilterChip == 2,
                    onClick = { selectedFilterChip = 2 },
                    label = {
                        Text(
                            text = stringResource(id = R.string.inspector_chip_editable, editableCount),
                            fontSize = 11.sp
                        )
                    },
                    shape = RoundedCornerShape(8.dp)
                )
                FilterChip(
                    selected = selectedFilterChip == 3,
                    onClick = { selectedFilterChip = 3 },
                    label = {
                        Text(
                            text = stringResource(id = R.string.inspector_chip_text, textCount),
                            fontSize = 11.sp
                        )
                    },
                    shape = RoundedCornerShape(8.dp)
                )
            }
        }

        // Captured Interactive Elements List
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(id = R.string.inspector_captured_count, filteredElements.size),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    OutlinedButton(
                        onClick = {
                            coroutineScope.launch {
                                val file = UiInspectorEngine.exportUiElementMapJson("Active Screen")
                                if (file != null) {
                                    Toast.makeText(
                                        context,
                                        context.getString(R.string.msg_ui_map_exported, file.name),
                                        Toast.LENGTH_LONG
                                    ).show()
                                }
                            }
                        },
                        enabled = elements.isNotEmpty(),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.outlinedButtonColors(
                            contentColor = MaterialTheme.colorScheme.primary
                        ),
                        border = androidx.compose.foundation.BorderStroke(
                            1.dp,
                            MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Download,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = stringResource(id = R.string.btn_export_ui_map),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                if (filteredElements.isEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.SearchOff,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                            modifier = Modifier.size(40.dp)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = stringResource(id = R.string.inspector_no_elements_title),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = stringResource(id = R.string.inspector_no_elements_desc),
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 16.dp)
                        )
                    }
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        filteredElements.take(60).forEach { el ->
                            InspectedElementRowCard(
                                element = el,
                                onClickDetails = { selectedElementForDetails = el },
                                onCopyLocator = { loc ->
                                    clipboardManager.setText(AnnotatedString(loc))
                                    Toast.makeText(
                                        context,
                                        context.getString(R.string.inspector_copied_toast),
                                        Toast.LENGTH_SHORT
                                    ).show()
                                },
                                onRecordAction = { actionType ->
                                    when (actionType) {
                                        "click" -> {
                                            val loc = el.accessibilityId.ifBlank { el.resourceId }.ifBlank { el.xpath }
                                            UiInspectorEngine.addRecordedStep(
                                                RecordedStep(
                                                    id = UUID.randomUUID().toString(),
                                                    actionType = "click",
                                                    elementName = el.name,
                                                    locator = loc
                                                )
                                            )
                                            Toast.makeText(
                                                context,
                                                context.getString(
                                                    R.string.inspector_msg_step_added,
                                                    "Click on ${el.name}"
                                                ),
                                                Toast.LENGTH_SHORT
                                            ).show()
                                        }

                                        "wait" -> {
                                            val loc = el.accessibilityId.ifBlank { el.resourceId }.ifBlank { el.xpath }
                                            UiInspectorEngine.addRecordedStep(
                                                RecordedStep(
                                                    id = UUID.randomUUID().toString(),
                                                    actionType = "wait",
                                                    elementName = el.name,
                                                    locator = loc
                                                )
                                            )
                                            Toast.makeText(
                                                context,
                                                context.getString(
                                                    R.string.inspector_msg_step_added,
                                                    "Wait for ${el.name}"
                                                ),
                                                Toast.LENGTH_SHORT
                                            ).show()
                                        }

                                        "input", "assert" -> {
                                            showInputDialogForElement = Pair(el, actionType)
                                            inputDialogText =
                                                if (actionType == "assert") el.text.ifBlank { el.contentDescription } else ""
                                        }
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }

    // Modal Bottom Sheet: Full Element Details & Locators
    selectedElementForDetails?.let { element ->
        ModalBottomSheet(
            onDismissRequest = { selectedElementForDetails = null },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            ElementDetailsSheetContent(
                element = element,
                onCopyLocator = { loc ->
                    clipboardManager.setText(AnnotatedString(loc))
                    Toast.makeText(context, context.getString(R.string.inspector_copied_toast), Toast.LENGTH_SHORT)
                        .show()
                },
                onRecordAction = { actionType ->
                    when (actionType) {
                        "click" -> {
                            val loc = element.accessibilityId.ifBlank { element.resourceId }.ifBlank { element.xpath }
                            UiInspectorEngine.addRecordedStep(
                                RecordedStep(
                                    id = UUID.randomUUID().toString(),
                                    actionType = "click",
                                    elementName = element.name,
                                    locator = loc
                                )
                            )
                            Toast.makeText(
                                context,
                                context.getString(R.string.inspector_msg_step_added, "Click on ${element.name}"),
                                Toast.LENGTH_SHORT
                            ).show()
                            selectedElementForDetails = null
                        }

                        "wait" -> {
                            val loc = element.accessibilityId.ifBlank { element.resourceId }.ifBlank { element.xpath }
                            UiInspectorEngine.addRecordedStep(
                                RecordedStep(
                                    id = UUID.randomUUID().toString(),
                                    actionType = "wait",
                                    elementName = element.name,
                                    locator = loc
                                )
                            )
                            Toast.makeText(
                                context,
                                context.getString(R.string.inspector_msg_step_added, "Wait for ${element.name}"),
                                Toast.LENGTH_SHORT
                            ).show()
                            selectedElementForDetails = null
                        }

                        "input", "assert" -> {
                            showInputDialogForElement = Pair(element, actionType)
                            inputDialogText =
                                if (actionType == "assert") element.text.ifBlank { element.contentDescription } else ""
                            selectedElementForDetails = null
                        }
                    }
                }
            )
        }
    }

    // Dialog for Input Text or Assert Text
    showInputDialogForElement?.let { (elem, actionType) ->
        AlertDialog(
            onDismissRequest = { showInputDialogForElement = null },
            title = {
                Text(
                    text = if (actionType == "input") stringResource(id = R.string.inspector_dialog_input_title) else stringResource(
                        id = R.string.inspector_action_assert
                    ),
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Element: ${elem.name}",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedTextField(
                        value = inputDialogText,
                        onValueChange = { inputDialogText = it },
                        placeholder = {
                            Text(
                                text = if (actionType == "input") stringResource(id = R.string.inspector_dialog_input_hint) else stringResource(
                                    id = R.string.inspector_dialog_assert_hint
                                ), fontSize = 12.sp
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = RoundedCornerShape(10.dp)
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        val loc = elem.accessibilityId.ifBlank { elem.resourceId }.ifBlank { elem.xpath }
                        UiInspectorEngine.addRecordedStep(
                            RecordedStep(
                                id = UUID.randomUUID().toString(),
                                actionType = actionType,
                                elementName = elem.name,
                                locator = loc,
                                argument = inputDialogText
                            )
                        )
                        Toast.makeText(
                            context,
                            context.getString(R.string.inspector_msg_step_added, "$actionType on ${elem.name}"),
                            Toast.LENGTH_SHORT
                        ).show()
                        showInputDialogForElement = null
                    },
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = stringResource(id = R.string.inspector_btn_confirm),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { showInputDialogForElement = null }) {
                    Text(text = stringResource(id = R.string.inspector_btn_cancel), fontSize = 12.sp)
                }
            },
            shape = RoundedCornerShape(16.dp)
        )
    }
}

@Composable
fun InspectedElementRowCard(
    element: InspectedElement,
    onClickDetails: () -> Unit,
    onCopyLocator: (String) -> Unit,
    onRecordAction: (String) -> Unit
) {
    val bestLocator = element.accessibilityId.ifBlank { element.resourceId }.ifBlank { element.xpath }

    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClickDetails() }
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.weight(1f)
                ) {
                    // Type Badge
                    val badgeColor = when {
                        element.isEditable -> Color(0xFF0284C7)
                        element.isClickable -> Color(0xFF6366F1)
                        element.className.contains("Image", ignoreCase = true) -> Color(0xFFEC4899)
                        element.text.isNotBlank() -> Color(0xFF10B981)
                        else -> Color(0xFF64748B)
                    }
                    val typeLabel = when {
                        element.isEditable -> "INPUT"
                        element.isClickable -> "BUTTON"
                        element.className.contains("Image", ignoreCase = true) -> "IMAGE"
                        element.text.isNotBlank() -> "TEXT"
                        else -> "VIEW"
                    }

                    Surface(
                        color = badgeColor.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(6.dp)
                    ) {
                        Text(
                            text = typeLabel,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            color = badgeColor,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }

                    Text(
                        text = element.name,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    IconButton(
                        onClick = { onCopyLocator(bestLocator) },
                        modifier = Modifier.size(30.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ContentCopy,
                            contentDescription = stringResource(id = R.string.inspector_copy_locator),
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp)
                        )
                    }

                    IconButton(
                        onClick = { onRecordAction("click") },
                        modifier = Modifier.size(30.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.TouchApp,
                            contentDescription = stringResource(id = R.string.inspector_action_click),
                            tint = MaterialTheme.colorScheme.secondary,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Primary Locator Preview
            Text(
                text = bestLocator,
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(6.dp))

            // Meta row: class & bounds
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = element.className.substringAfterLast('.'),
                    fontSize = 10.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )

                Text(
                    text = element.bounds,
                    fontSize = 9.sp,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                )
            }
        }
    }
}

@Composable
fun ElementDetailsSheetContent(
    element: InspectedElement,
    onCopyLocator: (String) -> Unit,
    onRecordAction: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 12.dp)
            .padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = element.name,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = element.className,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Quick Record Action Buttons
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Button(
                onClick = { onRecordAction("click") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                Icon(imageVector = Icons.Rounded.TouchApp, contentDescription = null, modifier = Modifier.size(14.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = stringResource(id = R.string.inspector_action_click),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            if (element.isEditable) {
                Button(
                    onClick = { onRecordAction("input") },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7)),
                    contentPadding = PaddingValues(vertical = 8.dp)
                ) {
                    Icon(imageVector = Icons.Rounded.Edit, contentDescription = null, modifier = Modifier.size(14.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = stringResource(id = R.string.inspector_action_input),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            Button(
                onClick = { onRecordAction("wait") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF64748B)),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                Icon(
                    imageVector = Icons.Rounded.HourglassEmpty,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = stringResource(id = R.string.inspector_action_wait),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            Button(
                onClick = { onRecordAction("assert") },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                contentPadding = PaddingValues(vertical = 8.dp)
            ) {
                Icon(
                    imageVector = Icons.Rounded.CheckCircle,
                    contentDescription = null,
                    modifier = Modifier.size(14.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = stringResource(id = R.string.inspector_action_assert),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        // Multi-Locators Section
        Text(
            text = stringResource(id = R.string.inspector_locators_header),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (element.accessibilityId.isNotBlank()) {
                LocatorCopyItem(
                    label = "accessibility_id",
                    locator = "accessibility_id=${element.accessibilityId}",
                    onCopy = { onCopyLocator("accessibility_id=${element.accessibilityId}") }
                )
            }

            if (element.resourceId.isNotBlank()) {
                LocatorCopyItem(
                    label = "id (Resource ID)",
                    locator = "id=${element.resourceId}",
                    onCopy = { onCopyLocator("id=${element.resourceId}") }
                )
            }

            if (element.uiSelector.isNotBlank()) {
                LocatorCopyItem(
                    label = "UiSelector (Android)",
                    locator = "android=${element.uiSelector}",
                    onCopy = { onCopyLocator("android=${element.uiSelector}") }
                )
            }

            if (element.xpath.isNotBlank()) {
                LocatorCopyItem(
                    label = "XPath",
                    locator = "xpath=${element.xpath}",
                    onCopy = { onCopyLocator("xpath=${element.xpath}") }
                )
            }
        }

        // Technical Properties Section
        Text(
            text = stringResource(id = R.string.inspector_element_details),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )

        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                PropertyDetailRow(label = stringResource(id = R.string.inspector_prop_bounds), value = element.bounds)
                PropertyDetailRow(label = stringResource(id = R.string.inspector_prop_class), value = element.className)
                if (element.packageName.isNotBlank()) {
                    PropertyDetailRow(
                        label = stringResource(id = R.string.inspector_prop_package),
                        value = element.packageName
                    )
                }
                if (element.resourceId.isNotBlank()) {
                    PropertyDetailRow(
                        label = stringResource(id = R.string.inspector_prop_resource_id),
                        value = element.resourceId
                    )
                }
                if (element.text.isNotBlank()) {
                    PropertyDetailRow(label = stringResource(id = R.string.inspector_prop_text), value = element.text)
                }
                if (element.contentDescription.isNotBlank()) {
                    PropertyDetailRow(
                        label = stringResource(id = R.string.inspector_prop_desc),
                        value = element.contentDescription
                    )
                }
                PropertyDetailRow(
                    label = stringResource(id = R.string.inspector_prop_clickable),
                    value = element.isClickable.toString()
                )
                PropertyDetailRow(
                    label = stringResource(id = R.string.inspector_prop_editable),
                    value = element.isEditable.toString()
                )
                PropertyDetailRow(
                    label = stringResource(id = R.string.inspector_prop_enabled),
                    value = element.isEnabled.toString()
                )
                PropertyDetailRow(
                    label = stringResource(id = R.string.inspector_prop_scrollable),
                    value = element.isScrollable.toString()
                )
            }
        }
    }
}

@Composable
fun LocatorCopyItem(
    label: String,
    locator: String,
    onCopy: () -> Unit
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(10.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = locator,
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }

            IconButton(onClick = onCopy, modifier = Modifier.size(28.dp)) {
                Icon(
                    imageVector = Icons.Rounded.ContentCopy,
                    contentDescription = stringResource(id = R.string.inspector_copy_locator),
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

@Composable
fun PropertyDetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            fontFamily = if (value.startsWith("[") || value.contains('.')) FontFamily.Monospace else FontFamily.Default,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
    }
}
