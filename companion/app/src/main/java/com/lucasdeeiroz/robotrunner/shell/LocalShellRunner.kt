package com.lucasdeeiroz.robotrunner.shell

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.concurrent.TimeUnit

data class ShellResult(
    val command: String,
    val exitCode: Int,
    val stdout: String,
    val stderr: String,
    val executionTimeMs: Long
)

data class ShellTemplate(
    val label: String,
    val command: String,
    val description: String
)

object LocalShellRunner {

    val defaultTemplates = listOf(
        ShellTemplate("Battery Stats", "dumpsys battery", "Inspect battery status and level"),
        ShellTemplate("Memory Breakdown", "dumpsys meminfo", "Show system memory distribution"),
        ShellTemplate("User Packages", "pm list packages -3", "List third-party user apps"),
        ShellTemplate("Android OS Version", "getprop ro.build.version.release", "Check Android release version"),
        ShellTemplate("Device Model", "getprop ro.product.model", "Check hardware model name"),
        ShellTemplate("Screen Density", "wm density", "Inspect display screen density"),
        ShellTemplate("Screen Resolution", "wm size", "Inspect display resolution"),
        ShellTemplate("Animation Scale", "settings get global window_animation_scale", "Read window animation scale")
    )

    suspend fun runCommand(command: String, timeoutMs: Long = 10000): ShellResult = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        var process: Process? = null
        val stdoutBuilder = StringBuilder()
        val stderrBuilder = StringBuilder()
        var exitCode = -1

        try {
            process = ProcessBuilder("sh", "-c", command).start()

            val stdoutReader = BufferedReader(InputStreamReader(process.inputStream))
            val stderrReader = BufferedReader(InputStreamReader(process.errorStream))

            val stdoutThread = Thread {
                try {
                    var line: String?
                    while (stdoutReader.readLine().also { line = it } != null) {
                        stdoutBuilder.append(line).append("\n")
                    }
                } catch (e: Exception) {
                    // Ignore stream closure
                }
            }

            val stderrThread = Thread {
                try {
                    var line: String?
                    while (stderrReader.readLine().also { line = it } != null) {
                        stderrBuilder.append(line).append("\n")
                    }
                } catch (e: Exception) {
                    // Ignore stream closure
                }
            }

            stdoutThread.start()
            stderrThread.start()

            val completed = process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)
            if (completed) {
                exitCode = process.exitValue()
                stdoutThread.join(1000)
                stderrThread.join(1000)
            } else {
                process.destroyForcibly()
                stderrBuilder.append("\n[Error: Command execution timed out after ${timeoutMs}ms]")
            }
        } catch (e: Exception) {
            stderrBuilder.append("\n[Exception: ${e.localizedMessage ?: e.message}]")
        } finally {
            process?.destroy()
        }

        val executionTimeMs = System.currentTimeMillis() - startTime
        ShellResult(
            command = command,
            exitCode = exitCode,
            stdout = stdoutBuilder.toString().trim(),
            stderr = stderrBuilder.toString().trim(),
            executionTimeMs = executionTimeMs
        )
    }
}
