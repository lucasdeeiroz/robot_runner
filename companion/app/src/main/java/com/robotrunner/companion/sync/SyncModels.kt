package com.robotrunner.companion.sync

enum class ArtifactCategory {
    UI_MAP,
    GOLDEN_FILE,
    TEST_SUITE,
    AUDIT_REPORT,
    PDF_REPORT,
    UNKNOWN
}

data class ArtifactItem(
    val name: String,
    val path: String,
    val category: ArtifactCategory,
    val sizeBytes: Long,
    val lastModifiedMs: Long
)

data class FleetPeerDevice(
    val ipAddress: String,
    val port: Int = 9876,
    val manufacturer: String = "Generic",
    val model: String = "Android Device",
    val isDesktop: Boolean = false,
    val batteryPercent: Int = 100,
    val activeTestStatus: String = "IDLE",
    val lastSeenMs: Long = System.currentTimeMillis()
)

data class PushPayload(
    val artifactType: String, // "UI_MAP", "GOLDEN_FILE", "TEST_SUITE"
    val fileName: String,
    val contentJson: String
)
