plugins {
    id("com.android.application")
    // Plugin adicionado explicitamente e plugin obsoleto do kotlin.android removido
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.lucasdeeiroz.robotrunner"
    compileSdk = 37
    buildToolsVersion = "37.0.0"

    defaultConfig {
        applicationId = "com.lucasdeeiroz.robotrunner"
        minSdk = 24
        targetSdk = 37
        versionCode = 300
        versionName = "3.0.0-alpha2"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    
    buildFeatures {
        compose = true
    }
    
    // O bloco composeOptions { kotlinCompilerExtensionVersion = ... } foi removido.
    // A partir do Kotlin 2.0, o org.jetbrains.kotlin.plugin.compose gerencia isso automaticamente.

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("androidx.concurrent:concurrent-futures-ktx:1.3.0")
    implementation("androidx.core:core-ktx:1.19.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
    
    // Compose BOM
    implementation(platform("androidx.compose:compose-bom:2026.06.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    
    // Image Loading
    implementation("io.coil-kt:coil-compose:2.6.0")
    implementation("io.coil-kt:coil-svg:2.6.0")
    
    // Material Icons
    implementation("androidx.compose.material:material-icons-core")
    
    // Material 3 (Essencial para as cores dinâmicas e UI Moderna do Android 16)
    implementation("androidx.compose.material3:material3")
    implementation("com.google.android.material:material:1.14.0")
    
    // Jetpack Navigation com Compose (Necessário para a Navegação Preditiva / Predictive Back)
    implementation("androidx.navigation:navigation-compose:2.9.8")

    // NanoHTTPd (Core Maven Central)
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    implementation("com.google.code.gson:gson:2.14.0")
}