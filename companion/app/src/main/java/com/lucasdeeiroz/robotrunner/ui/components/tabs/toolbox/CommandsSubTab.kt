package com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lucasdeeiroz.robotrunner.R
import com.lucasdeeiroz.robotrunner.shell.LocalShellRunner
import com.lucasdeeiroz.robotrunner.shell.ShellResult
import com.lucasdeeiroz.robotrunner.ui.components.glassmorphicBackground
import kotlinx.coroutines.launch

data class CommandAction(val labelResId: Int, val command: String)

data class CommandCategory(
    val nameResId: Int,
    val actions: List<CommandAction>
)

@Composable
fun CommandsSubTab() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var commandInput by remember { mutableStateOf("") }
    val readyMsg = stringResource(id = R.string.shell_console_ready_msg)
    var consoleLogs by remember { mutableStateOf(readyMsg) }
    var lastResult by remember { mutableStateOf<ShellResult?>(null) }
    var isRunning by remember { mutableStateOf(false) }

    fun execute(cmd: String) {
        if (cmd.isBlank() || isRunning) return
        isRunning = true
        consoleLogs += "\n$ $cmd\n"
        coroutineScope.launch {
            val res = LocalShellRunner.runCommand(cmd)
            lastResult = res
            if (res.stdout.isNotEmpty()) {
                consoleLogs += "${res.stdout}\n"
            }
            if (res.stderr.isNotEmpty()) {
                consoleLogs += "[STDERR]\n${res.stderr}\n"
            }
            consoleLogs += "[Exit code: ${res.exitCode} | ${res.executionTimeMs}ms]\n"
            isRunning = false
        }
    }

    val categories = listOf(
        CommandCategory(
            nameResId = R.string.commands_categories_network,
            actions = listOf(
                CommandAction(R.string.commands_actions_ip_address, "ip addr show wlan0"),
                CommandAction(R.string.commands_actions_ping_google, "ping -c 4 google.com"),
                CommandAction(R.string.commands_actions_netstat, "netstat")
            )
        ),
        CommandCategory(
            nameResId = R.string.commands_categories_device,
            actions = listOf(
                CommandAction(R.string.commands_actions_battery, "dumpsys battery"),
                CommandAction(R.string.commands_actions_reboot, "reboot"),
                CommandAction(R.string.commands_actions_uptime, "uptime"),
                CommandAction(R.string.commands_actions_device_info, "getprop ro.product.model")
            )
        ),
        CommandCategory(
            nameResId = R.string.commands_categories_apps,
            actions = listOf(
                CommandAction(R.string.commands_actions_list_packages, "pm list packages -3"),
                CommandAction(R.string.commands_actions_list_all_packages, "pm list packages"),
                CommandAction(R.string.commands_actions_top, "top -n 1")
            )
        ),
        CommandCategory(
            nameResId = R.string.commands_categories_ui,
            actions = listOf(
                CommandAction(R.string.commands_actions_dump_ui, "uiautomator dump"),
                CommandAction(R.string.commands_actions_screen_size, "wm size"),
                CommandAction(R.string.commands_actions_screen_density, "wm density"),
                CommandAction(R.string.commands_actions_animation_scale, "settings get global window_animation_scale")
            )
        )
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(bottom = 100.dp) // Avoid tab bar obstruction
    ) {
        // Quick Actions Section (Scrollable horizontally or wrapped)
        Text(
            text = stringResource(id = R.string.header_quick_actions),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(bottom = 6.dp)
        )

        var selectedCategoryIndex by remember { mutableIntStateOf(0) }

        // Category Selection Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            categories.forEachIndexed { index, category ->
                FilterChip(
                    selected = selectedCategoryIndex == index,
                    onClick = { selectedCategoryIndex = index },
                    label = { Text(text = stringResource(id = category.nameResId), fontSize = 12.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.2f),
                        selectedLabelColor = MaterialTheme.colorScheme.primary
                    ),
                    border = FilterChipDefaults.filterChipBorder(
                        enabled = true,
                        selected = selectedCategoryIndex == index,
                        borderColor = if (selectedCategoryIndex == index) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                    )
                )
            }
        }

        // Actions for selected category (Glassmorphic)
        val selectedCategory = categories[selectedCategoryIndex]
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .glassmorphicBackground(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp))
                .padding(12.dp)
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                selectedCategory.actions.forEach { action ->
                    SuggestionChip(
                        onClick = {
                            commandInput = action.command
                            execute(action.command)
                        },
                        label = { Text(text = stringResource(id = action.labelResId), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface) },
                        colors = SuggestionChipDefaults.suggestionChipColors(
                            containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.5f)
                        ),
                        border = SuggestionChipDefaults.suggestionChipBorder(
                            enabled = true,
                            borderColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                        )
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Input & Run Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = commandInput,
                onValueChange = { commandInput = it },
                placeholder = { Text(text = stringResource(id = R.string.shell_input_placeholder), fontSize = 12.sp) },
                modifier = Modifier.weight(1f),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    focusedTextColor = MaterialTheme.colorScheme.onSurface,
                    unfocusedTextColor = MaterialTheme.colorScheme.onSurface
                ),
                shape = RoundedCornerShape(8.dp),
                singleLine = true
            )

            Spacer(modifier = Modifier.width(8.dp))

            Button(
                onClick = { execute(commandInput) },
                enabled = !isRunning && commandInput.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                shape = RoundedCornerShape(8.dp),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)
            ) {
                if (isRunning) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(imageVector = Icons.Default.PlayArrow, contentDescription = "Run", modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(text = stringResource(id = R.string.btn_run_shell), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        // Execution Status Bar
        lastResult?.let { res ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .glassmorphicBackground(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(6.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = stringResource(id = R.string.shell_status_format, res.exitCode, res.executionTimeMs),
                    fontSize = 11.sp,
                    color = if (res.exitCode == 0) Color(0xFF34D399) else MaterialTheme.colorScheme.error,
                    fontWeight = FontWeight.SemiBold
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
        }

        // Console Controls Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(text = stringResource(id = R.string.shell_console_output_header), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)

            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                TextButton(
                    onClick = {
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        val clip = ClipData.newPlainText("Shell Output", consoleLogs)
                        clipboard.setPrimaryClip(clip)
                        Toast.makeText(context, context.getString(R.string.msg_copied_clipboard), Toast.LENGTH_SHORT).show()
                    },
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(text = stringResource(id = R.string.btn_copy_output), fontSize = 11.sp, color = Color(0xFF38BDF8))
                }

                TextButton(
                    onClick = {
                        consoleLogs = ""
                        lastResult = null
                    },
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(text = stringResource(id = R.string.btn_clear_console), fontSize = 11.sp, color = MaterialTheme.colorScheme.error)
                }
            }
        }

        Spacer(modifier = Modifier.height(4.dp))

        // Terminal Output Window
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            color = Color(0xFF060911),
            shape = RoundedCornerShape(8.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
        ) {
            SelectionContainer {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(12.dp)
                        .verticalScroll(rememberScrollState())
                ) {
                    Text(
                        text = consoleLogs,
                        fontSize = 11.5.sp,
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFF34D399),
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
        }
    }
}
