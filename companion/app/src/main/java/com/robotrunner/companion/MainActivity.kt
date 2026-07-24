package com.robotrunner.companion

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.text.format.Formatter
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.robotrunner.companion.checkup.HardwareCheckupRunner
import com.robotrunner.companion.checkup.LocalCheckupResult
import com.robotrunner.companion.checkup.PdfReportGenerator
import java.io.File
import java.net.NetworkInterface
import java.util.Collections

class MainActivity : ComponentActivity() {

    private var companionService: CompanionServerService? = null
    private var isBound by mutableStateOf(false)
    private var isServerRunning by mutableStateOf(false)
    private var activeClients by mutableStateOf(0)

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            val binder = service as CompanionServerService.LocalBinder
            companionService = binder.getService().apply {
                onStatusChangedListener = {
                    updateState()
                }
            }
            isBound = true
            updateState()
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            companionService = null
            isBound = false
            isServerRunning = false
            activeClients = 0
        }
    }

    private fun updateState() {
        companionService?.let { s ->
            isServerRunning = s.isRunning
            activeClients = s.activeClientsCount
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Log uncaught exceptions
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e("CompanionCrash", "Uncaught exception on thread ${thread.name}", throwable)
        }

        // Start Foreground Service safely
        try {
            val serviceIntent = Intent(this, CompanionServerService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    startForegroundService(serviceIntent)
                } catch (e: Exception) {
                    Log.w("MainActivity", "startForegroundService failed, falling back: ${e.message}")
                    startService(serviceIntent)
                }
            } else {
                startService(serviceIntent)
            }
            bindService(serviceIntent, connection, Context.BIND_AUTO_CREATE)
        } catch (e: Exception) {
            Log.e("MainActivity", "Error starting/binding service", e)
        }

        val checkupRunner = HardwareCheckupRunner(this)
        val pdfGenerator = PdfReportGenerator(this)

        setContent {
            CompanionAppUI(
                isServerRunning = isServerRunning,
                activeClients = activeClients,
                ipAddress = getLocalIpAddress(),
                port = CompanionServerService.SERVER_PORT,
                onToggleService = {
                    companionService?.let { s ->
                        if (s.isRunning) s.stopServer() else s.startServer()
                        updateState()
                    }
                },
                onRunOfflineCheckup = {
                    val result = checkupRunner.runLocalCheckup()
                    val pdfFile = pdfGenerator.generatePdfReport(result)
                    if (pdfFile != null) {
                        Toast.makeText(this, getString(R.string.msg_pdf_exported), Toast.LENGTH_LONG).show()
                    } else {
                        Toast.makeText(this, "Checkup done, but failed to save PDF", Toast.LENGTH_SHORT).show()
                    }
                }
            )
        }
    }

    override fun onDestroy() {
        if (isBound) {
            try {
                unbindService(connection)
            } catch (ignored: Exception) {}
            isBound = false
        }
        super.onDestroy()
    }

    private fun getLocalIpAddress(): String {
        try {
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            @Suppress("DEPRECATION")
            val ipInt = wifiManager.connectionInfo.ipAddress
            if (ipInt != 0) {
                @Suppress("DEPRECATION")
                return Formatter.formatIpAddress(ipInt)
            }
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            for (intf in interfaces) {
                val addrs = Collections.list(intf.inetAddresses)
                for (addr in addrs) {
                    if (!addr.isLoopbackAddress && addr.hostAddress?.contains(':') == false) {
                        return addr.hostAddress ?: "127.0.0.1"
                    }
                }
            }
        } catch (ignored: Exception) {}
        return "127.0.0.1"
    }
}

@Composable
fun CompanionAppUI(
    isServerRunning: Boolean,
    activeClients: Int,
    ipAddress: String,
    port: Int,
    onToggleService: () -> Unit,
    onRunOfflineCheckup: () -> Unit
) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Color(0xFF6366F1),
            surface = Color(0xFF0F172A),
            background = Color(0xFF090D16)
        )
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                // Header
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(top = 16.dp)
                ) {
                    Text(
                        text = stringResource(id = R.string.app_name),
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        text = "Mobile Companion Agent",
                        fontSize = 13.sp,
                        color = Color(0xFF94A3B8)
                    )
                }

                // Main Status Card
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 12.dp),
                    shape = RoundedCornerShape(24.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B))
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(
                            modifier = Modifier
                                .size(16.dp)
                                .background(
                                    color = if (isServerRunning) {
                                        if (activeClients > 0) Color(0xFF10B981) else Color(0xFF3B82F6)
                                    } else Color(0xFFEF4444),
                                    shape = RoundedCornerShape(8.dp)
                                )
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        Text(
                            text = if (isServerRunning) {
                                if (activeClients > 0) stringResource(id = R.string.status_connected) else stringResource(id = R.string.status_server_ready)
                            } else "Server Stopped",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color.White
                        )

                        Spacer(modifier = Modifier.height(12.dp))
                        HorizontalDivider(color = Color(0xFF334155))
                        Spacer(modifier = Modifier.height(12.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(text = "ADB Port", color = Color(0xFF94A3B8), fontSize = 13.sp)
                            Text(text = "$port", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(modifier = Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(text = "Device IP", color = Color(0xFF94A3B8), fontSize = 13.sp)
                            Text(text = ipAddress, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                // Controls Column
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedButton(
                        onClick = onRunOfflineCheckup,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF38BDF8))
                    ) {
                        Text(
                            text = stringResource(id = R.string.btn_export_pdf),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }

                    Button(
                        onClick = onToggleService,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isServerRunning) Color(0xFFDC2626) else Color(0xFF4F46E5)
                        )
                    ) {
                        Text(
                            text = if (isServerRunning) stringResource(id = R.string.btn_stop_service) else stringResource(id = R.string.btn_start_service),
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}
