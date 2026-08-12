package com.lucasdeeiroz.robotrunner.hardware

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput

class TouchTestActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TouchTestScreen()
        }
    }
}

@Composable
fun TouchTestScreen() {
    val paths = remember { mutableStateListOf<Path>() }
    var currentPath by remember { mutableStateOf<Path?>(null) }
    var recomposeTrigger by remember { mutableStateOf(0) }

    Canvas(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .pointerInput(Unit) {
                detectDragGestures(
                    onDragStart = { offset ->
                        val newPath = Path().apply { moveTo(offset.x, offset.y) }
                        currentPath = newPath
                    },
                    onDragEnd = {
                        currentPath?.let { paths.add(it) }
                        currentPath = null
                    },
                    onDragCancel = {
                        currentPath = null
                    },
                    onDrag = { change, _ ->
                        currentPath?.lineTo(change.position.x, change.position.y)
                        recomposeTrigger++ // Force recomposition
                    }
                )
            }
    ) {
        // use recomposeTrigger so it knows to redraw
        val dummy = recomposeTrigger
        
        paths.forEach { path ->
            drawPath(
                path = path,
                color = Color.Green,
                style = Stroke(width = 15f, cap = StrokeCap.Round)
            )
        }
        currentPath?.let { path ->
            drawPath(
                path = path,
                color = Color.Green,
                style = Stroke(width = 15f, cap = StrokeCap.Round)
            )
        }
    }
}
