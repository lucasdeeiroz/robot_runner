package com.lucasdeeiroz.robotrunner.sync

import android.content.Context
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object FleetP2pBridge {

    private val _peersFlow = MutableStateFlow<List<FleetPeerDevice>>(emptyList())
    val peersFlow: StateFlow<List<FleetPeerDevice>> = _peersFlow.asStateFlow()

    private val _isScanningFlow = MutableStateFlow(false)
    val isScanningFlow: StateFlow<Boolean> = _isScanningFlow.asStateFlow()

    /**
     * LAN fleet discovery is disabled. The Companion REST server now binds to 127.0.0.1 and
     * requires a session token, so peers are no longer reachable on `http://<lan-ip>:9876/ping`.
     * Probing the whole /24 subnet over cleartext HTTP was also an exposure in itself.
     */
    const val LAN_SCAN_ENABLED = false
    const val LAN_SCAN_DISABLED_REASON =
        "LAN fleet scan disabled: the Companion server is loopback-only and token-protected"

    fun startSubnetScan(@Suppress("UNUSED_PARAMETER") context: Context) {
        Log.i("FleetP2pBridge", LAN_SCAN_DISABLED_REASON)
        _peersFlow.value = emptyList()
        _isScanningFlow.value = false
    }

}
