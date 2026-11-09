plugins {
    id("com.android.application") version "9.3.0" apply false
    id("com.android.library") version "9.3.0" apply false
    id("org.jetbrains.kotlin.android") version "2.4.10" apply false
    // Plugin do Compose Compiler adicionado para suportar Kotlin 2.0+
    id("org.jetbrains.kotlin.plugin.compose") version "2.4.10" apply false
}

tasks.register("clean", Delete::class) {
    delete(rootProject.layout.buildDirectory)
}