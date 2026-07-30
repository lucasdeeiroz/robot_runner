package com.lucasdeeiroz.robotrunner.apps

import android.graphics.drawable.Drawable

data class PermissionItem(
    val permissionName: String,
    val isGranted: Boolean
)

data class AppInfo(
    val packageName: String,
    val appName: String,
    val versionName: String,
    val versionCode: Long,
    val isSystemApp: Boolean,
    val isEnabled: Boolean,
    val icon: Drawable?,
    val sourceDir: String,
    val permissions: List<PermissionItem> = emptyList()
)
