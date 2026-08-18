package com.lucasdeeiroz.robotrunner.hardware

import android.content.Context
import android.os.Build
import android.util.Log
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.annotations.SerializedName
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.util.regex.Pattern

/**
 * Generic & Configurable POS Firmware Expression Engine.
 *
 * Allows users to define custom recipe templates, property lookups with fallback chains,
 * regex extraction rules, dynamic Java reflection hooks, or shell commands to reconstruct
 * POS Firmware Version strings without hardcoding proprietary vendor logic in the codebase.
 */
object CustomFirmwareEngine {

    private const val TAG = "CustomFirmwareEngine"
    private const val PREFS_NAME = "robotrunner_custom_firmware_prefs"
    private const val KEY_RECIPE_JSON = "custom_firmware_recipe_json"

    data class FirmwareField(
        @SerializedName("type") val type: String = "prop", // "prop", "reflection", "shell", "static"
        @SerializedName("keys") val keys: List<String> = emptyList(),
        @SerializedName("className") val className: String? = null,
        @SerializedName("getterMethod") val getterMethod: String? = null,
        @SerializedName("invokeMethod") val invokeMethod: String? = null,
        @SerializedName("methodArgs") val methodArgs: List<Any> = emptyList(),
        @SerializedName("fallbackProps") val fallbackProps: List<String> = emptyList(),
        @SerializedName("regex") val regex: String? = null,
        @SerializedName("defaultValue") val defaultValue: String = ""
    )

    data class CustomFirmwareRecipe(
        @SerializedName("enabled") val enabled: Boolean = true,
        @SerializedName("label") val label: String = "POS Firmware",
        @SerializedName("template") val template: String = "{security}.{api}.{ap}.{mp}.{sp}",
        @SerializedName("fields") val fields: Map<String, FirmwareField> = emptyMap(),
        @SerializedName("shellCommand") val shellCommand: String? = null
    )

    fun getStoredRecipeJson(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(KEY_RECIPE_JSON, null)
        if (!saved.isNullOrBlank()) return saved

        // Check local storage recipe file if exists (/sdcard/RobotRunner/firmware_recipe.json)
        try {
            val externalFile = File(context.getExternalFilesDir(null), "firmware_recipe.json")
            if (externalFile.exists() && externalFile.canRead()) {
                return externalFile.readText()
            }
        } catch (_: Throwable) {}

        return getDefaultSampleRecipeJson()
    }

    fun saveStoredRecipeJson(context: Context, json: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_RECIPE_JSON, json).apply()

        // Also sync to external file for seamless sharing
        try {
            val externalDir = context.getExternalFilesDir(null)
            if (externalDir != null) {
                val file = File(externalDir, "firmware_recipe.json")
                file.writeText(json)
            }
        } catch (_: Throwable) {}
    }

    fun getDefaultSampleRecipeJson(): String {
        val sample = CustomFirmwareRecipe(
            enabled = true,
            label = "POS Firmware",
            template = "{security_version}.{api_version}.{ap_version}.{mp_version}.{sp_version}",
            fields = mapOf(
                "security_version" to FirmwareField(
                    type = "prop",
                    keys = listOf("ro.platform.security.version"),
                    defaultValue = "6201"
                ),
                "api_version" to FirmwareField(
                    type = "prop",
                    keys = listOf("ro.build.version.sdk"),
                    defaultValue = Build.VERSION.SDK_INT.toString()
                ),
                "ap_version" to FirmwareField(
                    type = "prop",
                    keys = listOf("ro.ap.version", "ro.rev.ap"),
                    defaultValue = "0000"
                ),
                "mp_version" to FirmwareField(
                    type = "prop",
                    keys = listOf("ro.pci.modem.ver", "gsm.version.baseband"),
                    regex = "V?(\\d{3})",
                    defaultValue = "000"
                ),
                "sp_version" to FirmwareField(
                    type = "reflection",
                    className = "com.pos.sdk.accessory.PosAccessoryManager",
                    getterMethod = "getDefault",
                    invokeMethod = "getVersion",
                    methodArgs = listOf(0),
                    fallbackProps = listOf("ro.pci.modem.ver", "ro.sp.version"),
                    regex = ".*?(\\d+)$",
                    defaultValue = "000"
                )
            )
        )
        return GsonBuilder().setPrettyPrinting().create().toJson(sample)
    }

    /**
     * Resolves the custom firmware version string based on stored configuration.
     * Returns null if disabled or unconfigured.
     */
    fun resolveFirmwareVersion(context: Context): String? {
        val json = getStoredRecipeJson(context)
        if (json.isBlank()) return null

        return evaluateRecipe(json)
    }

    /**
     * Evaluates a given recipe JSON string against the live system properties and reflection hooks.
     */
    fun evaluateRecipe(recipeJson: String): String? {
        return try {
            val gson = Gson()
            val recipe = gson.fromJson(recipeJson, CustomFirmwareRecipe::class.java) ?: return null
            if (!recipe.enabled) return null

            // 1. Direct Shell Command mode
            if (!recipe.shellCommand.isNullOrBlank()) {
                val shellOut = executeShellCommand(recipe.shellCommand)
                if (shellOut.isNotBlank()) return shellOut
            }

            // 2. Template and Field Interpolation mode
            var result = recipe.template
            for ((key, field) in recipe.fields) {
                val fieldValue = evaluateField(field)
                result = result.replace("{$key}", fieldValue)
            }

            result.trim()
        } catch (e: Throwable) {
            Log.e(TAG, "Error evaluating firmware recipe", e)
            null
        }
    }

    private fun evaluateField(field: FirmwareField): String {
        var value = ""

        when (field.type) {
            "prop" -> {
                for (propKey in field.keys) {
                    val pVal = getSystemProperty(propKey)
                    if (pVal.isNotBlank()) {
                        value = pVal
                        break
                    }
                }
            }
            "reflection" -> {
                // Safely attempt dynamic class loading & method invocation
                val reflVal = invokeDynamicReflection(
                    className = field.className,
                    getterMethod = field.getterMethod,
                    invokeMethod = field.invokeMethod,
                    methodArgs = field.methodArgs
                )
                if (!reflVal.isNullOrBlank()) {
                    value = reflVal
                } else {
                    // Fallback to property chain if reflection returns null or fails
                    for (propKey in field.fallbackProps) {
                        val pVal = getSystemProperty(propKey)
                        if (pVal.isNotBlank()) {
                            value = pVal
                            break
                        }
                    }
                }
            }
            "shell" -> {
                if (field.keys.isNotEmpty()) {
                    value = executeShellCommand(field.keys.first())
                }
            }
            "static" -> {
                value = field.defaultValue
            }
        }

        // Apply regex capture / extraction if configured
        if (value.isNotBlank() && !field.regex.isNullOrBlank()) {
            value = applyRegexExtraction(value, field.regex)
        }

        if (value.isBlank()) {
            value = field.defaultValue
        }

        return value
    }

    private fun applyRegexExtraction(input: String, patternStr: String): String {
        return try {
            val pattern = Pattern.compile(patternStr)
            val matcher = pattern.matcher(input)
            if (matcher.find()) {
                if (matcher.groupCount() >= 1) {
                    matcher.group(1) ?: input
                } else {
                    matcher.group(0) ?: input
                }
            } else {
                input
            }
        } catch (_: Throwable) {
            input
        }
    }

    /**
     * Safely queries an Android system property using reflection on android.os.SystemProperties,
     * falling back to local shell getprop execution.
     */
    fun getSystemProperty(key: String): String {
        if (key.isBlank()) return ""

        // Tier 1: android.os.SystemProperties via reflection
        try {
            val spClass = Class.forName("android.os.SystemProperties")
            val getMethod = spClass.getMethod("get", String::class.java, String::class.java)
            val result = getMethod.invoke(null, key, "") as? String
            if (!result.isNullOrBlank()) return result.trim()
        } catch (_: Throwable) {}

        // Tier 2: Local Shell command
        try {
            val process = Runtime.getRuntime().exec(arrayOf("getprop", key))
            BufferedReader(InputStreamReader(process.inputStream)).use { reader ->
                val line = reader.readLine()
                if (!line.isNullOrBlank()) return line.trim()
            }
        } catch (_: Throwable) {}

        return ""
    }

    /**
     * Safely invokes a dynamic method on an Android vendor SDK class without compile-time dependencies.
     */
    private fun invokeDynamicReflection(
        className: String?,
        getterMethod: String?,
        invokeMethod: String?,
        methodArgs: List<Any>
    ): String? {
        if (className.isNullOrBlank() || invokeMethod.isNullOrBlank()) return null

        try {
            val clazz = Class.forName(className)
            var targetInstance: Any? = null

            if (!getterMethod.isNullOrBlank()) {
                val getter = clazz.getMethod(getterMethod)
                targetInstance = getter.invoke(null)
            }

            val paramTypes = methodArgs.map { arg ->
                when (arg) {
                    is Int -> Int::class.javaPrimitiveType ?: Int::class.java
                    is Long -> Long::class.javaPrimitiveType ?: Long::class.java
                    is Boolean -> Boolean::class.javaPrimitiveType ?: Boolean::class.java
                    is Double -> Double::class.javaPrimitiveType ?: Double::class.java
                    else -> String::class.java
                }
            }.toTypedArray()

            val method = if (paramTypes.isNotEmpty()) {
                clazz.getMethod(invokeMethod, *paramTypes)
            } else {
                clazz.getMethod(invokeMethod)
            }

            val result = if (targetInstance != null) {
                method.invoke(targetInstance, *methodArgs.toTypedArray())
            } else {
                method.invoke(null, *methodArgs.toTypedArray())
            }

            return result?.toString()
        } catch (e: Throwable) {
            Log.d(TAG, "Reflection lookup for $className.$invokeMethod skipped or unavailable: ${e.message}")
            return null
        }
    }

    private fun executeShellCommand(command: String): String {
        return try {
            val process = ProcessBuilder("sh", "-c", command).start()
            val output = process.inputStream.bufferedReader().readText().trim()
            process.waitFor()
            output
        } catch (_: Throwable) {
            ""
        }
    }
}
