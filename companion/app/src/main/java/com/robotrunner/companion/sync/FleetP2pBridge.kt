package com.robotrunner.companion.sync

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL

object FleetP2pBridge {

    private val _peersFlow = MutableStateFlow<List<FleetPeerDevice>>(emptyList())
    val peersFlow: StateFlow<List<FleetPeerDevice>> = _peersFlow.asStateFlow()

    private val _isScanningFlow = MutableStateFlow(false)
    val isScanningFlow: StateFlow<Boolean> = _isScanningFlow.asStateFlow()

    private val gson = Gson()

    fun startSubnetScan(context: Context) {
        if (_isScanningFlow.value) return

        CoroutineScope(Dispatchers.IO).launch {
            _isScanningFlow.value = true
            val discoveredPeers = mutableListOf<FleetPeerDevice>()

            try {
                val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                val ipInt = wifiManager?.connectionInfo?.ipAddress ?: 0
                if (ipInt != 0) {
                    val localIp = String.format(
                        "%d.%d.%d.%d",
                        ipInt and 0xff,
                        ipInt shr 8 and 0xff,
                        ipInt shr 16 and 0xff,
                        ipInt shr 24 and 0xff
                    )
                    val prefix = localIp.substringBeforeLast(".") + "."

                    val jobs = (1..254).map { host ->
                        async(Dispatchers.IO) {
                            val targetIp = "$prefix$host"
                            if (targetIp != localIp) {
                                checkPeerAtIp(targetIp)?.let { peer ->
                                    synchronized(discoveredPeers) {
                                        discoveredPeers.add(peer)
                                    }
                                }
                            }
                        }
                    }
                    jobs.awaitAll()
                }
            } catch (e: Exception) {
                Log.e("FleetP2pBridge", "Error during subnet scan", e)
            } finally {
                _peersFlow.value = discoveredPeers
                _isScanningFlow.value = false
            }
        }
    }

    private fun checkPeerAtIp(ip: String): FleetPeerDevice? {
        var conn: HttpURLConnection? = null
        return try {
            val url = URL("http://$ip:9876/ping")
            conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 400
            conn.readTimeout = 400
            conn.requestMethod = "GET"

            if (conn.responseCode == 200) {
                val jsonStr = conn.inputStream.bufferedReader().use { it.readText() }
                val jsonObj = gson.fromJson(jsonStr, JsonObject::class.java)

                val model = jsonObj.get("model")?.asString ?: "Android Peer"
                val manufacturer = jsonObj.get("manufacturer")?.asString ?: "Generic"
                val isDesktop = jsonObj.get("isDesktop")?.asBoolean ?: false

                FleetPeerDevice(
                    ipAddress = ip,
                    port = 9876,
                    manufacturer = manufacturer,
                    model = model,
                    isDesktop = isDesktop,
                    lastSeenMs = System.currentTimeMillis()
                )
            } else null
        } catch (e: Throwable) {
            null
        } finally {
            conn?.disconnect()
        }
    }
}
