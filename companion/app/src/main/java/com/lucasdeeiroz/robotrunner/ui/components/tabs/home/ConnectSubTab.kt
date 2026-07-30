package com.lucasdeeiroz.robotrunner.ui.components.tabs.home

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.lucasdeeiroz.robotrunner.R
import com.lucasdeeiroz.robotrunner.net.*
import com.lucasdeeiroz.robotrunner.net.NetworkInterfaceType
import com.lucasdeeiroz.robotrunner.sync.ArtifactCategory
import com.lucasdeeiroz.robotrunner.sync.ArtifactItem
import com.lucasdeeiroz.robotrunner.sync.FleetP2pBridge
import com.lucasdeeiroz.robotrunner.sync.FleetPeerDevice

import com.lucasdeeiroz.robotrunner.sync.SyncManager
import java.io.File
import java.text.SimpleDateFormat
import java.util.*
import kotlinx.coroutines.launch




@Composable
fun ConnectSubTab(
    ipAddress: String,
    port: Int,
    isServerRunning: Boolean,
    activeClients: Int,
    onToggleServer: () -> Unit
) {
    val context = LocalContext.current
    var pairingPin by remember { mutableStateOf(WirelessAdbHelper.generatePairingPin()) }
    var pairingPortInput by remember { mutableStateOf("37000") }
    var interfacesList by remember { mutableStateOf<List<NetworkInterfaceItem>>(emptyList()) }
    var isLoadingInterfaces by remember { mutableStateOf(true) }

val coroutineScope = rememberCoroutineScope()
    val syncManager = remember { SyncManager(context) }

    var artifacts by remember { mutableStateOf<List<ArtifactItem>>(emptyList()) }
    var isLoadingArtifacts by remember { mutableStateOf(false) }

    val peers by FleetP2pBridge.peersFlow.collectAsState()
    val isScanningPeers by FleetP2pBridge.isScanningFlow.collectAsState()

    fun loadArtifacts() {
        coroutineScope.launch {
            isLoadingArtifacts = true
            artifacts = syncManager.listLocalArtifacts()
            isLoadingArtifacts = false
        }
    }

    LaunchedEffect(Unit) {
        loadArtifacts()
    }

    LaunchedEffect(Unit) {
        interfacesList = NetworkInspector.getNetworkInterfaces()
        isLoadingInterfaces = false
    }

    val pairingCommand = remember(ipAddress, pairingPortInput, pairingPin) {
        val p = pairingPortInput.toIntOrNull() ?: 5555
        WirelessAdbHelper.buildPairingCommand(ipAddress, p, pairingPin)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 100.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
    
            // 1. REST Server Engine Manager
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                shape = RoundedCornerShape(14.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = stringResource(id = R.string.header_rest_control),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
    
                    Spacer(modifier = Modifier.height(12.dp))
    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = if (isServerRunning) stringResource(id = R.string.status_port_active, port) else stringResource(id = R.string.status_server_offline),
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isServerRunning) Color(0xFF22C55E) else Color(0xFFEF4444)
                            )
                            Text(
                                text = stringResource(id = R.string.subtext_server_ip, ipAddress),
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
    
                        Button(
                            onClick = onToggleServer,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isServerRunning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                                contentColor = if (isServerRunning) MaterialTheme.colorScheme.onError else MaterialTheme.colorScheme.onPrimary
                            ),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                text = if (isServerRunning) stringResource(id = R.string.btn_stop_rest_server) else stringResource(id = R.string.btn_start_rest_server),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
    
                    Spacer(modifier = Modifier.height(10.dp))
    
                    Text(
                        text = stringResource(id = R.string.label_active_clients, activeClients),
                        fontSize = 12.sp,
                        color = Color(0xFF38BDF8)
                    )
                }
            }

            // 2. Wireless ADB Pairing Assistant
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                shape = RoundedCornerShape(14.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = stringResource(id = R.string.header_wireless_adb),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = stringResource(id = R.string.desc_wireless_adb),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
    
                    Spacer(modifier = Modifier.height(14.dp))
    
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // PIN Box
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = stringResource(id = R.string.label_pairing_pin),
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Surface(
                                color = MaterialTheme.colorScheme.surface,
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = pairingPin,
                                        fontSize = 18.sp,
                                        fontWeight = FontWeight.Bold,
                                        fontFamily = FontFamily.Monospace,
                                        color = Color(0xFF38BDF8)
                                    )
                                    TextButton(
                                        onClick = { pairingPin = WirelessAdbHelper.generatePairingPin() },
                                        contentPadding = PaddingValues(0.dp)
                                    ) {
                                        Text(
                                            text = stringResource(id = R.string.btn_gen_pin),
                                            fontSize = 11.sp,
                                            color = MaterialTheme.colorScheme.primary
                                        )
                                    }
                                }
                            }
                        }
    
                        // Port Input
                        Column(modifier = Modifier.weight(0.8f)) {
                            Text(
                                text = stringResource(id = R.string.label_pairing_port),
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            OutlinedTextField(
                                value = pairingPortInput,
                                onValueChange = { pairingPortInput = it },
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
                        }
                    }
    
                    Spacer(modifier = Modifier.height(12.dp))
    
                    // Pairing Snippet Box
                    Text(
                        text = stringResource(id = R.string.label_pairing_cmd),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Surface(
                        color = Color(0xFF060911),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = pairingCommand,
                                fontSize = 11.sp,
                                fontFamily = FontFamily.Monospace,
                                color = Color(0xFF34D399),
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(
                                onClick = {
                                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                    val clip = ClipData.newPlainText("ADB Pair Command", pairingCommand)
                                    clipboard.setPrimaryClip(clip)
                                    Toast.makeText(context, context.getString(R.string.msg_copied_clipboard), Toast.LENGTH_SHORT).show()
                                }
                            ) {
                                Text(text = "📋", fontSize = 14.sp)
                            }
                        }
                    }
    
                    Spacer(modifier = Modifier.height(14.dp))
    
                    Button(
                        onClick = { WirelessAdbHelper.openDeveloperOptions(context) },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Text(text = stringResource(id = R.string.btn_open_dev_options), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
    
            // 3. Active Network Interfaces Inspector
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                shape = RoundedCornerShape(14.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = stringResource(id = R.string.header_net_interfaces),
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
    
                    Spacer(modifier = Modifier.height(12.dp))
    
                    if (isLoadingInterfaces) {
                        CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally), color = MaterialTheme.colorScheme.primary)
                    } else {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            interfacesList.forEach { iface ->
                                NetworkInterfaceRow(iface = iface)
                            }
                        }
                    }
                }
            }

            // 4. Artifact Vault Explorer Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = stringResource(id = R.string.header_artifact_vault),
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = stringResource(id = R.string.msg_artifacts_stored, artifacts.size),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp
                        )
                    Spacer(modifier = Modifier.height(12.dp))
    
                    if (isLoadingArtifacts) {
                        Box(modifier = Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = Color(0xFF38BDF8))
                        }
                    } else if (artifacts.isEmpty()) {
                        Text(
                            text = stringResource(id = R.string.msg_no_artifacts_generated),
                            color = Color(0xFF64748B),
                            fontSize = 12.sp,
                            modifier = Modifier.padding(vertical = 16.dp)
                        )
                    } else {
                        val sdf = remember { SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()) }
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            artifacts.take(15).forEach { item ->
                                val badgeColor = when (item.category) {
                                    ArtifactCategory.UI_MAP -> Color(0xFF38BDF8)
                                    ArtifactCategory.GOLDEN_FILE -> Color(0xFFF59E0B)
                                    ArtifactCategory.TEST_SUITE -> Color(0xFFA855F7)
                                    ArtifactCategory.AUDIT_REPORT -> Color(0xFF10B981)
                                    ArtifactCategory.PDF_REPORT -> Color(0xFFEF4444)
                                    ArtifactCategory.UNKNOWN -> Color(0xFF64748B)
                                }
    
                                Surface(
                                    color = MaterialTheme.colorScheme.surface,
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(12.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column(modifier = Modifier.weight(1f)) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Surface(
                                                    color = badgeColor.copy(alpha = 0.2f),
                                                    shape = RoundedCornerShape(6.dp)
                                                ) {
                                                    Text(
                                                        text = item.category.name,
                                                        color = badgeColor,
                                                        fontSize = 8.5.sp,
                                                        fontWeight = FontWeight.Bold,
                                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                                    )
                                                }
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Text(
                                                    text = item.name,
                                                    color = MaterialTheme.colorScheme.onSurface,
                                                    fontSize = 11.5.sp,
                                                    fontWeight = FontWeight.SemiBold,
                                                    maxLines = 1,
                                                    overflow = TextOverflow.Ellipsis
                                                    )
                                                }
                                            Spacer(modifier = Modifier.height(4.dp))
                                            Text(
                                                text = stringResource(id = R.string.format_kb_date, (item.sizeBytes / 1024).toString(), sdf.format(Date(item.lastModifiedMs))),
                                                color = Color(0xFF64748B),
                                                fontSize = 10.sp
                                                )
                                            }
    
                                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                            IconButton(
                                                onClick = {
                                                    try {
                                                        val file = File(item.path)
                                                        val uri = FileProvider.getUriForFile(
                                                            context,
                                                            "${context.packageName}.fileprovider",
                                                            file
                                                        )
                                                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                                            type = if (item.name.endsWith(".pdf")) "application/pdf" else "application/json"
                                                            putExtra(Intent.EXTRA_STREAM, uri)
                                                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                                        }
                                                        context.startActivity(Intent.createChooser(shareIntent, context.getString(R.string.btn_share_artifact)))
                                                    } catch (e: Exception) {
                                                        Toast.makeText(context, context.getString(R.string.msg_error_sharing_artifact, e.message ?: ""), Toast.LENGTH_SHORT).show()
                                                    }
                                                },
                                                modifier = Modifier.size(32.dp)
                                            ) {
                                                Text(text = "📤", fontSize = 14.sp)
                                            }
    
                                            IconButton(
                                                onClick = {
                                                    coroutineScope.launch {
                                                        val deleted = syncManager.deleteArtifact(item.path)
                                                        if (deleted) {
                                                            loadArtifacts()
                                                            Toast.makeText(context, context.getString(R.string.msg_artifact_deleted), Toast.LENGTH_SHORT).show()
                                                        }
                                                    }
                                                },
                                                modifier = Modifier.size(32.dp)
                                            ) {
                                                Text(text = "🗑️", fontSize = 14.sp)
                                            }
                                        }
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
fun NetworkInterfaceRow(iface: NetworkInterfaceItem) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(8.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            val badgeColor = when (iface.interfaceType) {
                NetworkInterfaceType.WIFI -> Color(0xFF38BDF8)
                NetworkInterfaceType.ETHERNET -> Color(0xFF22C55E)
                NetworkInterfaceType.HOTSPOT -> Color(0xFFA855F7)
                NetworkInterfaceType.CELLULAR -> Color(0xFFF59E0B)
                NetworkInterfaceType.VPN -> Color(0xFFEC4899)
                else -> Color(0xFF64748B)
            }

            Surface(
                color = badgeColor,
                shape = RoundedCornerShape(4.dp)
            ) {
                Text(
                    text = iface.interfaceType.name,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = iface.name,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "IPv4: ${iface.ipv4}",
                    fontSize = 11.sp,
                    fontFamily = FontFamily.Monospace,
                    color = Color(0xFF34D399)
                )
                if (iface.ipv6 != "N/A") {
                    Text(
                        text = "IPv6: ${iface.ipv6}",
                        fontSize = 10.sp,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
