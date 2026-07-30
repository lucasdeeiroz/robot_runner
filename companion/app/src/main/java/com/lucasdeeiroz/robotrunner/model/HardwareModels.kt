package com.lucasdeeiroz.robotrunner.model

data class LiveTelemetry(
    val cpuUsagePercent: Int = 0,
    val ramUsedMb: Long = 0L,
    val ramTotalMb: Long = 0L,
    val ramPercent: Int = 0,
    val batteryPercent: Int = 0,
    val batteryCurrentMa: Int = 0,
    val batteryVoltageMv: Int = 0,
    val batteryTempC: Float = 0f,
    val isCharging: Boolean = false,
    val storageUsedGb: Float = 0f,
    val storageTotalGb: Float = 0f,
    val storagePercent: Int = 0,
    val isServerRunning: Boolean = false,
    val activeClientsCount: Int = 0,
    val isAccessibilityActive: Boolean = false
)

data class HardwareSpecCategory(
    val categoryName: String,
    val items: List<HardwareSpecItem>
)

data class HardwareSpecItem(
    val label: String,
    val value: String
)
