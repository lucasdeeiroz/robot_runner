package com.lucasdeeiroz.robotrunner.ui.components.tabs.home

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import com.lucasdeeiroz.robotrunner.R

import com.lucasdeeiroz.robotrunner.sync.FleetP2pBridge
import com.lucasdeeiroz.robotrunner.sync.FleetPeerDevice
import com.lucasdeeiroz.robotrunner.sync.SyncManager
import com.lucasdeeiroz.robotrunner.sync.ArtifactItem
import com.lucasdeeiroz.robotrunner.sync.ArtifactCategory
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun SyncCenterSubTab() {
    val context = LocalContext.current
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

    Column(
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 24.dp)
    ) {
        // 1. Bi-Directional Sync Header Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(id = R.string.header_sync_center),
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Surface(
                        color = Color(0xFF10B981).copy(alpha = 0.2f),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            text = "PORT 9876 ACTIVE",
                            color = Color(0xFF10B981),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = stringResource(id = R.string.desc_sync_center),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.height(14.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = { loadArtifacts() },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1))
                    ) {
                        Text(text = stringResource(id = R.string.btn_refresh_vault), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }

                    OutlinedButton(
                        onClick = {
                            Toast.makeText(context, "Desktop Sync Server Active at http://<ip>:9876/sync/artifacts", Toast.LENGTH_LONG).show()
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF38BDF8))
                    ) {
                        Text(text = stringResource(id = R.string.btn_export_all_desktop), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // 2. Fleet P2P Subnet Radar Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = stringResource(id = R.string.header_fleet_radar),
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.weight(1f)
                    )
                    if (isScanningPeers) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), color = Color(0xFF38BDF8), strokeWidth = 2.dp)
                    }
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = stringResource(id = R.string.desc_fleet_radar),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 12.sp
                )
                Spacer(modifier = Modifier.height(12.dp))

                Button(
                    onClick = { FleetP2pBridge.startSubnetScan(context) },
                    enabled = !isScanningPeers,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0284C7))
                ) {
                    Text(
                        text = if (isScanningPeers) "Scanning Wi-Fi Subnet..." else stringResource(id = R.string.btn_scan_fleet),
                        fontWeight = FontWeight.Bold
                    )
                }

                if (peers.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        peers.forEach { peer ->
                            Surface(
                                color = MaterialTheme.colorScheme.surface,
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(10.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(text = "${peer.manufacturer} ${peer.model}", color = MaterialTheme.colorScheme.onSurface, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                        Text(text = "IP: ${peer.ipAddress}:${peer.port}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp)
                                    }
                                    Surface(
                                        color = Color(0xFF22C55E).copy(alpha = 0.2f),
                                        shape = CircleShape
                                    ) {
                                        Text(
                                            text = "ONLINE",
                                            color = Color(0xFF22C55E),
                                            fontSize = 9.sp,
                                            fontWeight = FontWeight.Bold,
                                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Artifact Vault Explorer Card
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
                    text = "${artifacts.size} artifacts stored in Downloads",
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
                        text = "No artifacts generated yet. Run Inspector, BDD Tests, or Checkups to generate files.",
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
                                            text = "${item.sizeBytes / 1024} KB • ${sdf.format(Date(item.lastModifiedMs))}",
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
                                                    context.startActivity(Intent.createChooser(shareIntent, "Share Artifact"))
                                                } catch (e: Exception) {
                                                    Toast.makeText(context, "Error sharing artifact: ${e.message}", Toast.LENGTH_SHORT).show()
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
                                                        Toast.makeText(context, "Artifact deleted", Toast.LENGTH_SHORT).show()
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
