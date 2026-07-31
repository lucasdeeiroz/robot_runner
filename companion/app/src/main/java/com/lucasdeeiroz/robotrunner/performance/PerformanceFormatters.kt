package com.lucasdeeiroz.robotrunner.performance

import java.util.Locale

fun formatRam(mb: Number): String {
    val mbLong = mb.toLong()
    return when {
        mbLong >= 1024 -> String.format(Locale.US, "%.1f GB", mbLong / 1024f)
        mbLong > 0 -> "$mbLong MB"
        else -> "0 MB"
    }
}

fun formatPower(ma: Number): String {
    val maLong = ma.toLong()
    val absMa = Math.abs(maLong)
    val formatted = when {
        absMa >= 1000 -> String.format(Locale.US, "%.1f A", absMa / 1000f)
        else -> "$absMa mA"
    }
    return if (maLong < 0) "-$formatted" else formatted
}
