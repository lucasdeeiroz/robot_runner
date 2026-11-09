package com.lucasdeeiroz.robotrunner.overlay

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import androidx.compose.ui.platform.ComposeView
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner

class InspectorOverlayService : Service() {

    companion object {
        var isRunning = false
    }

    private var windowManager: WindowManager? = null
    private var composeView: ComposeView? = null
    private val composeLifecycleOwner = ComposeLifecycleOwner()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }

        isRunning = true
        try {
            windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            createOverlay()
            composeLifecycleOwner.start()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun createOverlay() {
        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 80
            y = 220
        }

        composeView = ComposeView(this).apply {
            setViewTreeLifecycleOwner(composeLifecycleOwner)
            setViewTreeViewModelStoreOwner(composeLifecycleOwner)
            setViewTreeSavedStateRegistryOwner(composeLifecycleOwner)
            setContent {
                InspectorOverlayView(
                    onClose = { stopSelf() },
                    onOpenApp = {
                        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
                        if (launchIntent != null) {
                            launchIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                            startActivity(launchIntent)
                        }
                    },
                    onDrag = { dx, dy ->
                        params.x += dx.toInt()
                        params.y += dy.toInt()
                        windowManager?.updateViewLayout(this@apply, params)
                    }
                )
            }
        }

        windowManager?.addView(composeView, params)
    }

    override fun onDestroy() {
        isRunning = false
        composeLifecycleOwner.stop()
        composeView?.let {
            try {
                windowManager?.removeView(it)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
        super.onDestroy()
    }
}
