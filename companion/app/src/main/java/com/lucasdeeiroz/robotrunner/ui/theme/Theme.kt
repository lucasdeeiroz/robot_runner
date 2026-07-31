package com.lucasdeeiroz.robotrunner.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.core.graphics.ColorUtils
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = PrimaryBlue,
    secondary = DarkSecondary,
    surface = DarkSurface,
    background = DarkBackground,
    surfaceVariant = DarkSurfaceVariant,
    onSurface = DarkOnSurface,
    onSurfaceVariant = DarkOnSurfaceVariant,
    outline = DarkOutline,
    tertiary = DarkTertiary
)



fun Color.withLightness(lightness: Float): Color {
    val hsl = FloatArray(3)
    ColorUtils.colorToHSL(this.toArgb(), hsl)
    hsl[2] = lightness
    return Color(ColorUtils.HSLToColor(hsl))
}

fun Color.blend(other: Color, ratio: Float): Color {
    val inverseRatio = 1f - ratio
    return Color(
        red = this.red * inverseRatio + other.red * ratio,
        green = this.green * inverseRatio + other.green * ratio,
        blue = this.blue * inverseRatio + other.blue * ratio,
        alpha = this.alpha
    )
}

private val LightColorScheme = lightColorScheme(
    primary = PrimaryBlue,
    secondary = LightSecondary,
    surface = LightSurface,
    background = LightBackground,
    surfaceVariant = LightSurfaceVariant,
    onSurface = LightOnSurface,
    onSurfaceVariant = LightOnSurfaceVariant,
    outline = LightOutline,
    tertiary = LightTertiary
)

@Composable
fun RobotRunnerTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicPrimaryColor: Color? = null,
    content: @Composable () -> Unit
) {
    val baseColorScheme = if (darkTheme) {
        DarkColorScheme
    } else {
        LightColorScheme
    }

    val seedColor = dynamicPrimaryColor ?: baseColorScheme.primary
    
    val generatedPrimary = if (darkTheme) seedColor.withLightness(0.80f) else seedColor.withLightness(0.40f)
    val generatedOnPrimary = if (darkTheme) seedColor.withLightness(0.20f) else Color.White
    val generatedPrimaryContainer = if (darkTheme) seedColor.withLightness(0.30f) else seedColor.withLightness(0.90f)
    val generatedOnPrimaryContainer = if (darkTheme) seedColor.withLightness(0.90f) else seedColor.withLightness(0.10f)

    val colorScheme = baseColorScheme.copy(
        primary = generatedPrimary,
        onPrimary = generatedOnPrimary,
        primaryContainer = generatedPrimaryContainer,
        onPrimaryContainer = generatedOnPrimaryContainer,
        surface = baseColorScheme.surface.blend(generatedPrimary, 0.04f),
        background = baseColorScheme.background.blend(generatedPrimary, 0.04f),
        surfaceVariant = baseColorScheme.surfaceVariant.blend(generatedPrimary, 0.08f)
    )

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            var context = view.context
            while (context is android.content.ContextWrapper && context !is android.app.Activity) {
                context = context.baseContext
            }
            if (context is android.app.Activity) {
                val window = context.window
                window.statusBarColor = colorScheme.surface.toArgb()
                WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
