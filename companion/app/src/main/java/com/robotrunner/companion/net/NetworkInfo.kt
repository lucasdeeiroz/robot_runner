package com.robotrunner.companion.net

data class NetworkInterfaceItem(
    val name: String,
    val displayName: String,
    val ipv4: String,
    val ipv6: String,
    val macAddress: String,
    val interfaceType: NetworkInterfaceType,
    val isUp: Boolean
)

enum class NetworkInterfaceType {
    WIFI,
    ETHERNET,
    HOTSPOT,
    CELLULAR,
    VPN,
    LOOPBACK,
    OTHER
}

data class WirelessAdbState(
    val ipAddress: String,
    val pairingPort: Int,
    val connectPort: Int,
    val pairingPin: String,
    val isWirelessAdbSupported: Boolean
)
