package com.lucasdeeiroz.robotrunner.inspector

data class InspectedElement(
    val id: String,
    val name: String,
    val className: String,
    val packageName: String = "",
    val text: String = "",
    val contentDescription: String = "",
    val resourceId: String = "",
    val bounds: String = "[0,0][0,0]",
    val accessibilityId: String = "",
    val uiSelector: String = "",
    val xpath: String = "",
    val isClickable: Boolean = false,
    val isEditable: Boolean = false,
    val isEnabled: Boolean = true,
    val isFocused: Boolean = false,
    val isScrollable: Boolean = false,
    val depth: Int = 0
)

data class RecordedStep(
    val id: String,
    val actionType: String, // "click", "input", "wait", "assert"
    val elementName: String,
    val locator: String,
    val argument: String? = null,
    val timestamp: Long = System.currentTimeMillis()
)

data class UiMapElement(
    val id: String,
    val name: String,
    val type: String,
    val accessibilityId: String? = null,
    val androidId: String? = null,
    val text: String? = null,
    val description: String? = null,
    val xpath: String? = null
)

data class UiElementMap(
    val version: String = "2.0",
    val screenId: String,
    val screenName: String,
    val elements: List<UiMapElement>
)

