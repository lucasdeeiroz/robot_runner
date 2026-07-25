package com.robotrunner.companion.net

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.NetworkInterface
import java.util.Collections

object NetworkInspector {

    suspend fun getNetworkInterfaces(): List<NetworkInterfaceItem> = withContext(Dispatchers.IO) {
        val resultList = mutableListOf<NetworkInterfaceItem>()

        try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            for (iface in interfaces) {
                val addrs = Collections.list(iface.inetAddresses)
                var ipv4 = ""
                var ipv6 = ""

                for (addr in addrs) {
                    if (!addr.isLoopbackAddress) {
                        if (addr is Inet4Address && ipv4.isEmpty()) {
                            ipv4 = addr.hostAddress ?: ""
                        } else if (addr is Inet6Address && ipv6.isEmpty()) {
                            ipv6 = addr.hostAddress?.substringBefore('%') ?: ""
                        }
                    } else if (iface.name == "lo") {
                        if (addr is Inet4Address && ipv4.isEmpty()) ipv4 = addr.hostAddress ?: ""
                    }
                }

                if (ipv4.isEmpty() && ipv6.isEmpty() && !iface.isUp) {
                    continue
                }

                val macBytes = try { iface.hardwareAddress } catch (e: Exception) { null }
                val macAddress = if (macBytes != null && macBytes.isNotEmpty()) {
                    macBytes.joinToString(":") { String.format("%02X", it) }
                } else {
                    "N/A"
                }

                val type = classifyInterface(iface.name)

                resultList.add(
                    NetworkInterfaceItem(
                        name = iface.name,
                        displayName = iface.displayName ?: iface.name,
                        ipv4 = if (ipv4.isNotEmpty()) ipv4 else "N/A",
                        ipv6 = if (ipv6.isNotEmpty()) ipv6 else "N/A",
                        macAddress = macAddress,
                        interfaceType = type,
                        isUp = iface.isUp
                    )
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        resultList.sortedWith(compareBy({ it.interfaceType.ordinal }, { it.name }))
    }

    private fun classifyInterface(name: String): NetworkInterfaceType {
        val lower = name.lowercase()
        return when {
            lower.contains("wlan") || lower.contains("wifi") -> NetworkInterfaceType.WIFI
            lower.contains("eth") -> NetworkInterfaceType.ETHERNET
            lower.contains("ap") || lower.contains("swlan") || lower.contains("tether") -> NetworkInterfaceType.HOTSPOT
            lower.contains("rmnet") || lower.contains("pdp") || lower.contains("ccmni") || lower.contains("cellular") -> NetworkInterfaceType.CELLULAR
            lower.contains("tun") || lower.contains("ppp") || lower.contains("wireguard") -> NetworkInterfaceType.VPN
            lower.contains("lo") -> NetworkInterfaceType.LOOPBACK
            else -> NetworkInterfaceType.OTHER
        }
    }

    fun getActiveConnectionType(context: Context): String {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return "Offline"
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = cm.activeNetwork ?: return "Offline"
            val caps = cm.getNetworkCapabilities(network) ?: return "Offline"
            when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Cellular Data"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "VPN"
                else -> "Active Network"
            }
        } else {
            @Suppress("DEPRECATION")
            val info = cm.activeNetworkInfo
            if (info != null && info.isConnected) info.typeName else "Offline"
        }
    }
}
