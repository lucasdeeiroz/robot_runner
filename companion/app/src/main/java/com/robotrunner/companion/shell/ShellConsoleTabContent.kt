package com.robotrunner.companion.shell

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
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
import kotlinx.coroutines.launch

@Composable
fun ShellConsoleTabContent() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var commandInput by remember { mutableStateOf("") }
    var consoleLogs by remember { mutableStateOf("Ready to execute local commands on device.\n") }
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

    Column(modifier = Modifier.fillMaxSize()) {
        // Templates Header & Row
        Text(
            text = stringResource(id = R.string.shell_header_templates),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(bottom = 6.dp)
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(bottom = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            LocalShellRunner.defaultTemplates.forEach { template ->
                SuggestionChip(
                    onClick = {
                        commandInput = template.command
                        execute(template.command)
                    },
                    label = { Text(text = template.label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface) },
                    colors = SuggestionChipDefaults.suggestionChipColors(
                        containerColor = MaterialTheme.colorScheme.surfaceVariant
                    ),
                    border = SuggestionChipDefaults.suggestionChipBorder(
                        enabled = true,
                        borderColor = MaterialTheme.colorScheme.outlineVariant
                    )
                )
            }
        }

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
                    focusedBorderColor = Color(0xFF6366F1),
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
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                shape = RoundedCornerShape(8.dp),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 12.dp)
            ) {
                if (isRunning) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        color = MaterialTheme.colorScheme.onSurface,
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(text = stringResource(id = R.string.btn_run_shell), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        // Execution Status Bar
        lastResult?.let { res ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(6.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = stringResource(id = R.string.shell_status_format, res.exitCode, res.executionTimeMs),
                    fontSize = 11.sp,
                    color = if (res.exitCode == 0) Color(0xFF22C55E) else Color(0xFFEF4444),
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
            Text(text = "Console Output", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)

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
                    Text(text = stringResource(id = R.string.btn_clear_console), fontSize = 11.sp, color = Color(0xFFEF4444))
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
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.surfaceVariant)
        ) {
            SelectionContainer {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(12.dp)
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
