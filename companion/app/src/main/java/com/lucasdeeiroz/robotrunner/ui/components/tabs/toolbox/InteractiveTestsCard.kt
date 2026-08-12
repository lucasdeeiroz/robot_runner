package com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox

import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraManager
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lucasdeeiroz.robotrunner.R
import com.lucasdeeiroz.robotrunner.hardware.InteractiveHardwareTester
import com.lucasdeeiroz.robotrunner.hardware.PrinterHelper
import com.lucasdeeiroz.robotrunner.hardware.ScannerTestActivity
import com.lucasdeeiroz.robotrunner.hardware.TouchTestActivity
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.File

@Composable
fun InteractiveTestsCard(context: Context, onLaunchDisplayTest: () -> Unit) {
    val testResults by InteractiveHardwareTester.testResults.collectAsState()
    var showDialogFor by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(stringResource(id = R.string.header_interactive_tests), color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(6.dp))
            Text(stringResource(id = R.string.desc_interactive_tests), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            Spacer(modifier = Modifier.height(14.dp))

            TestRow(stringResource(id = R.string.test_scanner), "scanner", testResults["scanner"]) {
                context.startActivity(Intent(context, ScannerTestActivity::class.java))
                showDialogFor = "scanner"
            }
            TestRow(stringResource(id = R.string.test_screen_pixels), "pixels", testResults["pixels"]) {
                onLaunchDisplayTest()
                showDialogFor = "pixels"
            }
            TestRow(stringResource(id = R.string.test_touch_screen), "touch", testResults["touch"]) {
                context.startActivity(Intent(context, TouchTestActivity::class.java))
                showDialogFor = "touch"
            }
            TestRow(stringResource(id = R.string.test_vibration), "vibration", testResults["vibration"]) {
                vibrateDevice(context)
                showDialogFor = "vibration"
            }
            TestRow(stringResource(id = R.string.test_camera_flash), "flash", testResults["flash"]) {
                toggleFlash(context, true)
                showDialogFor = "flash"
            }
            TestRow(stringResource(id = R.string.test_audio_speaker), "speaker", testResults["speaker"]) {
                playTestSound(context)
                showDialogFor = "speaker"
            }
            TestRow(stringResource(id = R.string.test_microphone), "mic", testResults["mic"]) {
                val tempFile = File(context.cacheDir, "test_mic.3gp")
                val recorder = MediaRecorder().apply {
                    setAudioSource(MediaRecorder.AudioSource.MIC)
                    setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP)
                    setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB)
                    setOutputFile(tempFile.absolutePath)
                }
                try {
                    recorder.prepare()
                    recorder.start()
                    Toast.makeText(context, context.getString(R.string.msg_recording_audio), Toast.LENGTH_SHORT).show()
                    coroutineScope.launch {
                        delay(3000)
                        recorder.stop()
                        recorder.release()
                        
                        val player = MediaPlayer()
                        player.setDataSource(tempFile.absolutePath)
                        player.prepare()
                        player.start()
                        Toast.makeText(context, context.getString(R.string.msg_playing_audio), Toast.LENGTH_SHORT).show()
                        
                        showDialogFor = "mic"
                    }
                } catch (e: Exception) {
                    Toast.makeText(context, context.getString(R.string.msg_failed_mic), Toast.LENGTH_SHORT).show()
                    InteractiveHardwareTester.updateResult("mic", false)
                }
            }
            TestRow(stringResource(id = R.string.test_pos_printer), "printer", testResults["printer"]) {
                val runner = com.lucasdeeiroz.robotrunner.checkup.HardwareCheckupRunner(context)
                val printed = runner.printTestReceipt()
                InteractiveHardwareTester.updateResult("printer", printed)
                if (!printed) {
                    Toast.makeText(context, context.getString(R.string.msg_pos_printer_unavailable), Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    if (showDialogFor != null) {
        val testName = showDialogFor!!
        AlertDialog(
            onDismissRequest = { 
                if (testName == "flash") toggleFlash(context, false)
                showDialogFor = null 
            },
            title = { Text(stringResource(id = R.string.dialog_test_pass_title)) },
            text = { Text(context.getString(R.string.dialog_test_pass_desc, testName)) },
            confirmButton = {
                Button(onClick = {
                    if (testName == "flash") toggleFlash(context, false)
                    InteractiveHardwareTester.updateResult(testName, true)
                    showDialogFor = null
                }) { Text(stringResource(id = R.string.btn_pass)) }
            },
            dismissButton = {
                OutlinedButton(onClick = {
                    if (testName == "flash") toggleFlash(context, false)
                    InteractiveHardwareTester.updateResult(testName, false)
                    showDialogFor = null
                }) { Text(stringResource(id = R.string.btn_fail)) }
            }
        )
    }
}

@Composable
fun TestRow(name: String, key: String, passed: Boolean?, onTestClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(name, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
            val statusColor = when(passed) {
                true -> Color(0xFF10B981)
                false -> MaterialTheme.colorScheme.error
                null -> MaterialTheme.colorScheme.onSurfaceVariant
            }
            val statusText = when(passed) {
                true -> stringResource(id = R.string.status_passed)
                false -> stringResource(id = R.string.status_failed)
                null -> stringResource(id = R.string.status_waiting)
            }
            Text(statusText, color = statusColor, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Button(
            onClick = onTestClick,
            shape = RoundedCornerShape(8.dp),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
        ) {
            Text(stringResource(id = R.string.btn_test), fontSize = 12.sp)
        }
    }
}

private fun vibrateDevice(context: Context) {
    val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
        vibratorManager.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
    
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        vibrator.vibrate(VibrationEffect.createOneShot(500, VibrationEffect.DEFAULT_AMPLITUDE))
    } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(500)
    }
}

private fun toggleFlash(context: Context, state: Boolean) {
    try {
        val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val cameraId = cameraManager.cameraIdList[0] // Assume first camera has flash
        cameraManager.setTorchMode(cameraId, state)
    } catch (e: Exception) {
        // Flash not available
    }
}

private fun playTestSound(context: Context) {
    try {
        val uri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION)
        val ringtone = android.media.RingtoneManager.getRingtone(context, uri)
        ringtone.play()
    } catch (e: Exception) {
    }
}
