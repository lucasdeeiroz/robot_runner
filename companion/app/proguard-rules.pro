# Keep NanoHTTPd classes and methods
-keep class org.nanohttpd.** { *; }
-dontwarn org.nanohttpd.**

# Keep Gson serialization and deserialization
-keep class com.google.gson.** { *; }
-dontwarn com.google.gson.**

# Keep Companion models and data classes
-keep class com.lucasdeeiroz.robotrunner.model.** { *; }
-keep class com.lucasdeeiroz.robotrunner.checkup.** { *; }
-keep class com.lucasdeeiroz.robotrunner.hardware.** { *; }
-keep class com.lucasdeeiroz.robotrunner.server.** { *; }
-keep class com.lucasdeeiroz.robotrunner.service.** { *; }
-keep class com.lucasdeeiroz.robotrunner.stopwatch.** { *; }

# Keep Android Support and CameraX
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**
