package com.lucasdeeiroz.robotrunner.shell

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.async
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.awaitAll
import java.io.BufferedReader
import java.io.InputStreamReader

data class ShellResult(
    val command: String,
    val exitCode: Int,
    val stdout: String,
    val stderr: String,
    val executionTimeMs: Long
)

object LocalShellRunner {

    suspend fun runCommand(command: String, timeoutMs: Long = 10000): ShellResult = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        var process: Process? = null
        val stdoutBuilder = java.lang.StringBuilder()
        val stderrBuilder = java.lang.StringBuilder()
        var exitCode = -1

        try {
            process = ProcessBuilder("sh", "-c", command).start()

            val stdoutReader = BufferedReader(InputStreamReader(process.inputStream))
            val stderrReader = BufferedReader(InputStreamReader(process.errorStream))

            // Coroutine para leitura do stdout
            val stdoutJob = async(Dispatchers.IO) {
                try {
                    var line: String?
                    while (stdoutReader.readLine().also { line = it } != null) {
                        stdoutBuilder.append(line).append("\n")
                    }
                } catch (e: Exception) {
                    // Ignora fechamento de stream
                }
            }

            // Coroutine para leitura do stderr
            val stderrJob = async(Dispatchers.IO) {
                try {
                    var line: String?
                    while (stderrReader.readLine().also { line = it } != null) {
                        stderrBuilder.append(line).append("\n")
                    }
                } catch (e: Exception) {
                    // Ignora fechamento de stream
                }
            }

            // Aguarda o processo com timeout seguro usando withTimeoutOrNull
            val processCompleted = withTimeoutOrNull(timeoutMs) {
                // Suspende esperando o processo
                exitCode = process.waitFor()
                true
            }

            if (processCompleted != null) {
                // Aguarda leitura dos buffers finalizar
                awaitAll(stdoutJob, stderrJob)
            } else {
                process.destroyForcibly()
                stderrJob.cancel()
                stdoutJob.cancel()
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
