import java.io.File

fun main() {
    val output = """
Tasks: 1026 total,   1 running, 1025 sleeping,   0 stopped,   0 zombie
  Mem:    11113M total,    10637M used,      475M free,        2M buffers
 Swap:     4095M total,     3999M used,       96M free,     2959M cached
800%cpu   4%user   0%nice  21%sys 768%idle   0%iow   4%irq   4%sirq   0%host
  PID USER         PR  NI VIRT  RES  SHR S[%CPU] %MEM     TIME+ ARGS
10257 shell        20   0  10G 5.1M 3.7M R 17.8   0.0   0:00.05 top -b -n 1 -m 15
 1808 wifi         20   0  10G  13M 4.8M S  3.5   0.1   1:39.12 android.hardware.wifi-service
 9929 u0_a111      20   0  17G  98M  53M S  0.0   0.8   0:00.12 com.samsung.android.privacydashboard
 9442 root         20   0    0    0    0 I  0.0   0.0   0:00.00 [kworker/5:1]
 8463 u0_a53       20   0  16G  91M  48M S  0.0   0.8   0:00.04 com.sec.android.provider.badge
"""
    var startParsing = false
    var count = 0
    for (line in output.lines()) {
        val trimmed = line.trim()
        if (trimmed.startsWith("PID") && trimmed.contains("USER") && (trimmed.contains("COMMAND") || trimmed.contains("ARGS"))) {
            startParsing = true
            continue
        }
        if (startParsing && trimmed.isNotEmpty()) {
            val toks = trimmed.split("\\s+".toRegex())
            println("Row: " + toks.joinToString(", "))
            if (toks.size >= 12) {
                count++
            } else {
                println("Failed: ${toks.size} tokens")
            }
        }
    }
    println("Parsed: $count")
}
