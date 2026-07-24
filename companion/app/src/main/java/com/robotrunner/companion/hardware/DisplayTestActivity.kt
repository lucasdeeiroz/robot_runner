package com.robotrunner.companion.hardware

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.robotrunner.companion.R

class DisplayTestActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            WindowCompat.setDecorFitsSystemWindows(window, false)
        } catch (e: Exception) {
            Log.e("DisplayTestActivity", "Error setting decor fits system windows", e)
        }

        setContent {
            val colors = remember {
                listOf(
                    Color.Red to R.string.color_red,
                    Color.Green to R.string.color_green,
                    Color.Blue to R.string.color_blue,
                    Color.White to R.string.color_white,
                    Color.Black to R.string.color_black
                )
            }
            var currentIndex by remember { mutableStateOf(0) }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(colors[currentIndex].first)
                    .clickable {
                        if (currentIndex < colors.size - 1) {
                            currentIndex++
                        } else {
                            finish()
                        }
                    },
                contentAlignment = Alignment.BottomCenter
            ) {
                Text(
                    text = "${stringResource(id = colors[currentIndex].second)} - ${stringResource(id = R.string.text_tap_to_cycle)}",
                    color = if (colors[currentIndex].first == Color.White) Color.Black else Color.White,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(bottom = 32.dp)
                )
            }
        }

        // Post insets controller hiding safely after decorView is created
        window.decorView.post {
            try {
                val controller = WindowCompat.getInsetsController(window, window.decorView)
                controller.hide(WindowInsetsCompat.Type.statusBars() or WindowInsetsCompat.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            } catch (e: Exception) {
                Log.e("DisplayTestActivity", "Error setting fullscreen insets in post", e)
            }
        }
    }
}
