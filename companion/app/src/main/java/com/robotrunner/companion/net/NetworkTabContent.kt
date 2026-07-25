package com.robotrunner.companion.net

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.robotrunner.companion.R

@Composable
fun NetworkTabContent(
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
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Section 1: Wireless ADB Pairing Assistant
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = stringResource(id = R.string.header_wireless_adb),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                Text(
                    text = stringResource(id = R.string.desc_wireless_adb),
                    fontSize = 12.sp,
                    color = Color(0xFF94A3B8)
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
                            color = Color(0xFF94A3B8)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Surface(
                            color = Color(0xFF0F172A),
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
                                        color = Color(0xFF6366F1)
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
                            color = Color(0xFF94A3B8)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        OutlinedTextField(
                            value = pairingPortInput,
                            onValueChange = { pairingPortInput = it },
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Color(0xFF6366F1),
                                unfocusedBorderColor = Color(0xFF334155),
                                focusedContainerColor = Color(0xFF0F172A),
                                unfocusedContainerColor = Color(0xFF0F172A),
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White
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
                    color = Color(0xFF94A3B8)
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
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Text(text = stringResource(id = R.string.btn_open_dev_options), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        // Section 2: Active Network Interfaces Inspector
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = stringResource(id = R.string.header_net_interfaces),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )

                Spacer(modifier = Modifier.height(12.dp))

                if (isLoadingInterfaces) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally), color = Color(0xFF6366F1))
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        interfacesList.forEach { iface ->
                            NetworkInterfaceRow(iface = iface)
                        }
                    }
                }
            }
        }

        // Section 3: REST Server Engine Manager
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E293B)),
            shape = RoundedCornerShape(14.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = stringResource(id = R.string.header_rest_control),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
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
                            color = Color(0xFF94A3B8)
                        )
                    }

                    Button(
                        onClick = onToggleServer,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isServerRunning) Color(0xFFEF4444) else Color(0xFF22C55E)
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
    }
}

@Composable
fun NetworkInterfaceRow(iface: NetworkInterfaceItem) {
    Surface(
        color = Color(0xFF0F172A),
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
                    color = Color.White,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = iface.name,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
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
                        color = Color(0xFF94A3B8)
                    )
                }
            }
        }
    }
}
