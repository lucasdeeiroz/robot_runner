package com.lucasdeeiroz.robotrunner.hardware

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object InteractiveHardwareTester {
    // Keys: "scanner", "pixels", "speaker", "mic", "vibration", "flash", "printer"
    // Value: true = Passed, false = Failed, null = Not Tested
    private val _testResults = MutableStateFlow<Map<String, Boolean?>>(emptyMap())
    val testResults: StateFlow<Map<String, Boolean?>> = _testResults.asStateFlow()

    fun updateResult(testKey: String, passed: Boolean) {
        val current = _testResults.value.toMutableMap()
        current[testKey] = passed
        _testResults.value = current
    }

    fun getResult(testKey: String): Boolean? {
        return _testResults.value[testKey]
    }
    
    fun resetAll() {
        _testResults.value = emptyMap()
    }
}
