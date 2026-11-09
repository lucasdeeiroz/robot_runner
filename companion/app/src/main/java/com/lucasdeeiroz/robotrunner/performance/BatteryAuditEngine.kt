package com.lucasdeeiroz.robotrunner.performance

import android.content.Context
import android.content.pm.PackageManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class BatteryAuditItem(
    val uid: String,
    val packageName: String,
    val consumptionMah: Float
)

object BatteryAuditEngine {
    
    suspend fun runAudit(context: Context): List<BatteryAuditItem> = withContext(Dispatchers.IO) {
        val results = mutableListOf<BatteryAuditItem>()
        try {
            val process = Runtime.getRuntime().exec(arrayOf("dumpsys", "batterystats"))
            val reader = process.inputStream.bufferedReader()
            
            var inPowerUseSection = false
            reader.forEachLine { line ->
                android.util.Log.d("BatteryAuditEngine", "STDOUT: $line")
                val trimmed = line.trim()
                if (trimmed.startsWith("Estimated power use")) {
                    inPowerUseSection = true
                } else if (inPowerUseSection && trimmed.isEmpty()) {
                    // empty line
                } else if (inPowerUseSection && (trimmed.startsWith("Uid ") || trimmed.startsWith("UID ") || trimmed.startsWith("User "))) {
                    val parts = trimmed.split(":")
                    if (parts.size >= 2) {
                        val uidPart = parts[0].trim()
                        val consumptionPart = parts[1].trim()
                        
                        val rawUidStr = uidPart.removePrefix("Uid ").removePrefix("UID ").removePrefix("User ").trim()
                        val consumptionStr = consumptionPart.split(" ")[0].trim()
                        
                        val consumption = consumptionStr.toFloatOrNull()
                        if (consumption != null && consumption > 0f) {
                            val uidInt = parseUidString(rawUidStr)
                            val packageName = getPackageNameForUid(context, uidInt, rawUidStr)
                            results.add(BatteryAuditItem(rawUidStr, packageName, consumption))
                        }
                    }
                } else if (inPowerUseSection && trimmed.startsWith("All partial wake locks:")) {
                    inPowerUseSection = false
                }
            }
            
            val errorReader = process.errorStream.bufferedReader()
            errorReader.forEachLine { line ->
                android.util.Log.e("BatteryAuditEngine", "STDERR: $line")
            }
            process.waitFor()
        } catch (e: Exception) {
            e.printStackTrace()
        }
        
        results.sortByDescending { it.consumptionMah }
        return@withContext results
    }
    
    suspend fun resetBatteryStats() = withContext(Dispatchers.IO) {
        try {
            val process = Runtime.getRuntime().exec(arrayOf("dumpsys", "batterystats", "--reset"))
            process.waitFor()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
    
    private fun parseUidString(uidStr: String): Int {
        if (uidStr.startsWith("u") && uidStr.contains("a")) {
            try {
                val appPart = uidStr.substringAfter("a").toIntOrNull()
                val userPart = uidStr.substringAfter("u").substringBefore("a").toIntOrNull() ?: 0
                if (appPart != null) {
                    return userPart * 100000 + 10000 + appPart
                }
            } catch (e: Exception) {
                // Ignore
            }
        }
        return uidStr.toIntOrNull() ?: -1
    }
    
    private fun getPackageNameForUid(context: Context, uid: Int, fallback: String): String {
        if (uid == -1) return fallback
        if (uid == 0) return "Android System"
        if (uid == 1000) return "Android OS"
        
        val pm = context.packageManager
        val packages = pm.getPackagesForUid(uid)
        
        if (!packages.isNullOrEmpty()) {
            return if (packages.size == 1) {
                packages[0]
            } else {
                "${packages[0]} (+${packages.size - 1})"
            }
        }
        return fallback
    }
}
