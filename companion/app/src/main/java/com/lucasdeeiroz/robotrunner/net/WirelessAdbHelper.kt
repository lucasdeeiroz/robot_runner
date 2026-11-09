package com.lucasdeeiroz.robotrunner.net

import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import kotlin.random.Random

object WirelessAdbHelper {

    fun isWirelessAdbSupported(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
    }

    fun generatePairingPin(): String {
        val pinInt = Random.nextInt(100000, 999999)
        return pinInt.toString()
    }

    fun buildPairingCommand(ipAddress: String, port: Int, pin: String): String {
        return "adb pair $ipAddress:$port $pin"
    }

    fun buildConnectCommand(ipAddress: String, port: Int = 5555): String {
        return "adb connect $ipAddress:$port"
    }

    fun openDeveloperOptions(context: Context): Boolean {
        return try {
            val intent = Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            try {
                val fallbackIntent = Intent(Settings.ACTION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(fallbackIntent)
                true
            } catch (ex: Exception) {
                false
            }
        }
    }
}
