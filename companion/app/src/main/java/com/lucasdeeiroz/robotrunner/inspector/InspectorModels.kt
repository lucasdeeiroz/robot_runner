package com.lucasdeeiroz.robotrunner.inspector

data class InspectedElement(
    val id: String,
    val name: String,
    val className: String,
    val text: String,
    val contentDescription: String,
    val resourceId: String,
    val bounds: String,
    val accessibilityId: String,
    val uiSelector: String,
    val xpath: String,
    val isClickable: Boolean,
    val isEditable: Boolean
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
