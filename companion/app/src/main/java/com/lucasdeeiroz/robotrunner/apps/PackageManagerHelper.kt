package com.lucasdeeiroz.robotrunner.apps

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

object PackageManagerHelper {

    suspend fun getInstalledApps(context: Context): List<AppInfo> = withContext(Dispatchers.IO) {
        val pm = context.packageManager
        val apps = mutableListOf<AppInfo>()

        try {
            @Suppress("DEPRECATION")
            val packages: List<PackageInfo> = pm.getInstalledPackages(PackageManager.GET_PERMISSIONS)

            for (pkg in packages) {
                val appInfo = pkg.applicationInfo ?: continue
                val appName = try {
                    pm.getApplicationLabel(appInfo).toString()
                } catch (e: Exception) {
                    pkg.packageName
                }

                val icon = try {
                    pm.getApplicationIcon(appInfo)
                } catch (e: Exception) {
                    null
                }

                val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0 ||
                        (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0

                val versionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    pkg.longVersionCode
                } else {
                    @Suppress("DEPRECATION")
                    pkg.versionCode.toLong()
                }

                val permissionItems = mutableListOf<PermissionItem>()
                val reqPermissions = pkg.requestedPermissions
                val reqFlags = pkg.requestedPermissionsFlags

                if (reqPermissions != null) {
                    for (i in reqPermissions.indices) {
                        val permName = reqPermissions[i]
                        val isGranted = if (reqFlags != null && i < reqFlags.size) {
                            (reqFlags[i] and PackageInfo.REQUESTED_PERMISSION_GRANTED) != 0
                        } else {
                            pm.checkPermission(permName, pkg.packageName) == PackageManager.PERMISSION_GRANTED
                        }
                        permissionItems.add(PermissionItem(permissionName = permName, isGranted = isGranted))
                    }
                }

                apps.add(
                    AppInfo(
                        packageName = pkg.packageName,
                        appName = appName,
                        versionName = pkg.versionName ?: "N/A",
                        versionCode = versionCode,
                        isSystemApp = isSystem,
                        isEnabled = appInfo.enabled,
                        icon = icon,
                        sourceDir = appInfo.sourceDir ?: "",
                        permissions = permissionItems
                    )
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        apps.sortedBy { it.appName.lowercase() }
    }

    fun launchApp(context: Context, packageName: String): Boolean {
        return try {
            val intent = context.packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                true
            } else {
                false
            }
        } catch (e: Exception) {
            false
        }
    }

    fun openAppDetails(context: Context, packageName: String) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun uninstallApp(context: Context, packageName: String) {
        try {
            val intent = Intent(Intent.ACTION_DELETE).apply {
                data = Uri.parse("package:$packageName")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    suspend fun backupApk(app: AppInfo): File? = withContext(Dispatchers.IO) {
        try {
            val sourceFile = File(app.sourceDir)
            if (!sourceFile.exists()) return@withContext null

            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            if (!downloadsDir.exists()) downloadsDir.mkdirs()

            val sanitizedAppName = app.appName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val destFile = File(downloadsDir, "backup_${sanitizedAppName}_v${app.versionName}.apk")

            FileInputStream(sourceFile).use { input ->
                FileOutputStream(destFile).use { output ->
                    input.copyTo(output)
                }
            }
            destFile
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    suspend fun shareApk(context: Context, app: AppInfo): Boolean = withContext(Dispatchers.IO) {
        try {
            val sourceFile = File(app.sourceDir)
            if (!sourceFile.exists()) return@withContext false

            val cacheDir = File(context.cacheDir, "shared_apks")
            if (!cacheDir.exists()) cacheDir.mkdirs()

            val sanitizedAppName = app.appName.replace(Regex("[^a-zA-Z0-9._-]"), "_")
            val targetFile = File(cacheDir, "${sanitizedAppName}_v${app.versionName}.apk")

            FileInputStream(sourceFile).use { input ->
                FileOutputStream(targetFile).use { output ->
                    input.copyTo(output)
                }
            }

            val contentUri: Uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                targetFile
            )

            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "application/vnd.android.package-archive"
                putExtra(Intent.EXTRA_STREAM, contentUri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            context.startActivity(Intent.createChooser(shareIntent, "Share APK: ${app.appName}").apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
