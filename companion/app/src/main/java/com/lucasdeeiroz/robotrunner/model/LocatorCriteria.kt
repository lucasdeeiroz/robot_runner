package com.lucasdeeiroz.robotrunner.model

import android.view.accessibility.AccessibilityNodeInfo

data class LocatorCriteria(
    val resourceId: String? = null,
    val resIdOptions: List<String> = emptyList(),
    val textMatch: String? = null,
    val textExact: String? = null,
    val textOptions: List<String> = emptyList(),
    val textMatchOptions: List<String> = emptyList(),
    val contentDescMatch: String? = null,
    val contentDescExact: String? = null,
    val contentDescOptions: List<String> = emptyList(),
    val contentDescMatchOptions: List<String> = emptyList(),
    val className: String? = null,
    val packageName: String? = null,
    val isScrollable: Boolean? = null,
    val isClickable: Boolean? = null,
    val isEnabled: Boolean? = null,
    val isChecked: Boolean? = null,
    val isFocusable: Boolean? = null,
    val isFocused: Boolean? = null,
    val isSelected: Boolean? = null,
    val instance: Int = 0,
    val isOrMatch: Boolean = false
) {
    fun matches(node: AccessibilityNodeInfo): Boolean {
        val nodeResId = node.viewIdResourceName ?: ""
        val nodeText = node.text?.toString() ?: ""
        val nodeDesc = node.contentDescription?.toString() ?: ""
        val nodeClass = node.className?.toString() ?: ""

        if (isOrMatch) {
            val resOk = !resourceId.isNullOrEmpty() && nodeResId.equals(resourceId, ignoreCase = true)
            val textOk = !textMatch.isNullOrEmpty() && (nodeText.contains(textMatch, ignoreCase = true) || nodeDesc.contains(textMatch, ignoreCase = true))
            val descOk = !contentDescMatch.isNullOrEmpty() && (nodeDesc.contains(contentDescMatch, ignoreCase = true) || nodeText.contains(contentDescMatch, ignoreCase = true))
            return resOk || textOk || descOk
        }

        // 1. Resource ID
        if (resIdOptions.isNotEmpty()) {
            val matched = resIdOptions.any { opt ->
                nodeResId.equals(opt, ignoreCase = true) || nodeResId.endsWith("/$opt", ignoreCase = true)
            }
            if (!matched) return false
        } else if (!resourceId.isNullOrEmpty()) {
            if (!nodeResId.equals(resourceId, ignoreCase = true) && !nodeResId.endsWith("/$resourceId", ignoreCase = true)) {
                return false
            }
        }

        // 2. Exact Content Description (or list of OR options)
        if (contentDescOptions.isNotEmpty()) {
            val matched = contentDescOptions.any { opt ->
                val target = opt.trim()
                nodeDesc.trim().equals(target, ignoreCase = true) ||
                nodeText.trim().equals(target, ignoreCase = true) ||
                nodeDesc.replace("\r", "").trim().equals(target.replace("\r", ""), ignoreCase = true) ||
                nodeText.replace("\r", "").trim().equals(target.replace("\r", ""), ignoreCase = true) ||
                nodeDesc.replace("\n", " ").trim().equals(target.replace("\n", " "), ignoreCase = true) ||
                nodeText.replace("\n", " ").trim().equals(target.replace("\n", " "), ignoreCase = true)
            }
            if (!matched) return false
        } else if (!contentDescExact.isNullOrEmpty()) {
            val target = contentDescExact.trim()
            val matched = nodeDesc.trim().equals(target, ignoreCase = true) ||
                    nodeText.trim().equals(target, ignoreCase = true) ||
                    nodeDesc.replace("\r", "").trim().equals(target.replace("\r", ""), ignoreCase = true) ||
                    nodeText.replace("\r", "").trim().equals(target.replace("\r", ""), ignoreCase = true) ||
                    nodeDesc.replace("\n", " ").trim().equals(target.replace("\n", " "), ignoreCase = true) ||
                    nodeText.replace("\n", " ").trim().equals(target.replace("\n", " "), ignoreCase = true)
            if (!matched) return false
        }

        // 3. Substring Content Description (or list of OR options)
        if (contentDescMatchOptions.isNotEmpty()) {
            val matched = contentDescMatchOptions.any { opt ->
                nodeDesc.contains(opt, ignoreCase = true) || nodeText.contains(opt, ignoreCase = true)
            }
            if (!matched) return false
        } else if (!contentDescMatch.isNullOrEmpty()) {
            if (!nodeDesc.contains(contentDescMatch, ignoreCase = true) && !nodeText.contains(contentDescMatch, ignoreCase = true)) {
                return false
            }
        }

        // 4. Exact Text (or list of OR options)
        if (textOptions.isNotEmpty()) {
            val matched = textOptions.any { opt ->
                val target = opt.trim()
                nodeText.trim().equals(target, ignoreCase = true) ||
                nodeDesc.trim().equals(target, ignoreCase = true) ||
                nodeText.replace("\r", "").trim().equals(target.replace("\r", ""), ignoreCase = true) ||
                nodeDesc.replace("\r", "").trim().equals(target.replace("\r", ""), ignoreCase = true) ||
                nodeText.replace("\n", " ").trim().equals(target.replace("\n", " "), ignoreCase = true) ||
                nodeDesc.replace("\n", " ").trim().equals(target.replace("\n", " "), ignoreCase = true)
            }
            if (!matched) return false
        } else if (!textExact.isNullOrEmpty()) {
            val target = textExact.trim()
            val matched = nodeText.trim().equals(target, ignoreCase = true) ||
                    nodeDesc.trim().equals(target, ignoreCase = true) ||
                    nodeText.replace("\r", "").trim().equals(target.replace("\r", ""), ignoreCase = true) ||
                    nodeDesc.replace("\r", "").trim().equals(target.replace("\r", ""), ignoreCase = true) ||
                    nodeText.replace("\n", " ").trim().equals(target.replace("\n", " "), ignoreCase = true) ||
                    nodeDesc.replace("\n", " ").trim().equals(target.replace("\n", " "), ignoreCase = true)
            if (!matched) return false
        }

        // 5. Substring Text (or list of OR options)
        if (textMatchOptions.isNotEmpty()) {
            val matched = textMatchOptions.any { opt ->
                nodeText.contains(opt, ignoreCase = true) || nodeDesc.contains(opt, ignoreCase = true)
            }
            if (!matched) return false
        } else if (!textMatch.isNullOrEmpty()) {
            if (!nodeText.contains(textMatch, ignoreCase = true) && !nodeDesc.contains(textMatch, ignoreCase = true)) {
                return false
            }
        }

        // 6. Class Name (with flexible matching for Views/Compose/Flutter/Native)
        if (!className.isNullOrEmpty()) {
            val exact = nodeClass.equals(className, ignoreCase = true) || nodeClass.endsWith(".$className", ignoreCase = true)
            val isButtonTarget = className.endsWith("Button", ignoreCase = true)
            val isImageTarget = className.endsWith("ImageView", ignoreCase = true) || className.endsWith("Image", ignoreCase = true)
            val isTextTarget = className.endsWith("TextView", ignoreCase = true) || className.endsWith("Text", ignoreCase = true)
            val isViewTarget = className.endsWith("View", ignoreCase = true) || className.endsWith("ViewGroup", ignoreCase = true)

            val flexibleMatch = (isButtonTarget || isImageTarget || isTextTarget || isViewTarget) && (
                nodeClass.endsWith("View", ignoreCase = true) ||
                nodeClass.endsWith("ViewGroup", ignoreCase = true) ||
                nodeClass.endsWith("TextView", ignoreCase = true) ||
                nodeClass.endsWith("ImageView", ignoreCase = true) ||
                nodeClass.endsWith("ImageButton", ignoreCase = true) ||
                nodeClass.endsWith("Button", ignoreCase = true)
            )

            if (!exact && !flexibleMatch) {
                return false
            }
        }

        // 7. Package Name
        if (!packageName.isNullOrEmpty()) {
            val nodePkg = node.packageName?.toString() ?: ""
            if (!nodePkg.equals(packageName, ignoreCase = true)) {
                return false
            }
        }

        // 8. State attributes
        if (isScrollable != null && node.isScrollable != isScrollable) return false
        if (isClickable != null && node.isClickable != isClickable) return false
        if (isEnabled != null && node.isEnabled != isEnabled) return false
        if (isChecked != null && node.isChecked != isChecked) return false
        if (isFocusable != null && node.isFocusable != isFocusable) return false
        if (isFocused != null && node.isFocused != isFocused) return false
        if (isSelected != null && node.isSelected != isSelected) return false

        // Check that at least one criterion was specified
        val hasAnyCondition = !resourceId.isNullOrEmpty() ||
                resIdOptions.isNotEmpty() ||
                !textExact.isNullOrEmpty() ||
                textOptions.isNotEmpty() ||
                !textMatch.isNullOrEmpty() ||
                textMatchOptions.isNotEmpty() ||
                !contentDescExact.isNullOrEmpty() ||
                contentDescOptions.isNotEmpty() ||
                !contentDescMatch.isNullOrEmpty() ||
                contentDescMatchOptions.isNotEmpty() ||
                !className.isNullOrEmpty() ||
                !packageName.isNullOrEmpty() ||
                isScrollable != null ||
                isClickable != null ||
                isEnabled != null ||
                isChecked != null ||
                isFocusable != null ||
                isFocused != null ||
                isSelected != null

        return hasAnyCondition
    }

    companion object {
        fun parse(raw: String): LocatorCriteria {
            val unescaped = raw.replace("\\n", "\n").trim()

            // 1. Accessibility ID (matches either contentDescription or text)
            if (unescaped.startsWith("accessibility_id=")) {
                val value = unescaped.removePrefix("accessibility_id=").trim()
                return LocatorCriteria(
                    contentDescMatch = value,
                    textMatch = value,
                    isOrMatch = true
                )
            }

            // 2. Resource ID
            if (unescaped.startsWith("id=")) {
                val value = unescaped.removePrefix("id=").trim()
                return LocatorCriteria(resourceId = value)
            }

            // 3. Class Name
            if (unescaped.startsWith("class=") || unescaped.startsWith("className=")) {
                val value = unescaped.substringAfter("=").trim()
                return LocatorCriteria(className = value)
            }

            // 4. UiSelector (with or without 'android=' prefix)
            if (unescaped.contains("new UiSelector()")) {
                var resId: String? = null
                var textM: String? = null
                var textEx: String? = null
                var descM: String? = null
                var descEx: String? = null
                var clazz: String? = null
                var pkg: String? = null
                var scroll: Boolean? = null
                var click: Boolean? = null
                var enable: Boolean? = null
                var check: Boolean? = null
                var focusable: Boolean? = null
                var focused: Boolean? = null
                var selected: Boolean? = null
                var inst = 0

                Regex("""className\("([^"]+)"\)""").find(unescaped)?.let { clazz = it.groupValues[1] }
                Regex("""packageName\("([^"]+)"\)""").find(unescaped)?.let { pkg = it.groupValues[1] }
                Regex("""resourceId\("([^"]+)"\)""").find(unescaped)?.let { resId = it.groupValues[1] }

                Regex("""text\("([^"]+)"\)""").find(unescaped)?.let { textEx = it.groupValues[1] }
                Regex("""textContains\("([^"]+)"\)""").find(unescaped)?.let { textM = it.groupValues[1] }
                Regex("""textStartsWith\("([^"]+)"\)""").find(unescaped)?.let { textM = it.groupValues[1] }
                Regex("""textMatches\("([^"]+)"\)""").find(unescaped)?.let { textM = it.groupValues[1] }

                Regex("""description\("([^"]+)"\)""").find(unescaped)?.let { descEx = it.groupValues[1] }
                Regex("""descriptionContains\("([^"]+)"\)""").find(unescaped)?.let { descM = it.groupValues[1] }
                Regex("""descriptionStartsWith\("([^"]+)"\)""").find(unescaped)?.let { descM = it.groupValues[1] }
                Regex("""descriptionMatches\("([^"]+)"\)""").find(unescaped)?.let { descM = it.groupValues[1] }

                Regex("""scrollable\((true|false)\)""").find(unescaped)?.let { scroll = it.groupValues[1].toBoolean() }
                Regex("""clickable\((true|false)\)""").find(unescaped)?.let { click = it.groupValues[1].toBoolean() }
                Regex("""enabled\((true|false)\)""").find(unescaped)?.let { enable = it.groupValues[1].toBoolean() }
                Regex("""checked\((true|false)\)""").find(unescaped)?.let { check = it.groupValues[1].toBoolean() }
                Regex("""focusable\((true|false)\)""").find(unescaped)?.let { focusable = it.groupValues[1].toBoolean() }
                Regex("""focused\((true|false)\)""").find(unescaped)?.let { focused = it.groupValues[1].toBoolean() }
                Regex("""selected\((true|false)\)""").find(unescaped)?.let { selected = it.groupValues[1].toBoolean() }

                Regex("""instance\((\d+)\)""").find(unescaped)?.let { inst = it.groupValues[1].toIntOrNull() ?: 0 }
                Regex("""index\((\d+)\)""").find(unescaped)?.let { inst = it.groupValues[1].toIntOrNull() ?: 0 }

                return LocatorCriteria(
                    resourceId = resId,
                    textMatch = textM,
                    textExact = textEx,
                    contentDescMatch = descM,
                    contentDescExact = descEx,
                    className = clazz,
                    packageName = pkg,
                    isScrollable = scroll,
                    isClickable = click,
                    isEnabled = enable,
                    isChecked = check,
                    isFocusable = focusable,
                    isFocused = focused,
                    isSelected = selected,
                    instance = inst,
                    isOrMatch = false
                )
            }

            // 5. XPath locator
            if (unescaped.startsWith("xpath=") || unescaped.startsWith("//") || unescaped.startsWith("(//")) {
                val descExactList = mutableListOf<String>()
                Regex("""@content-desc=['"]([^'"]+)['"]""").findAll(unescaped).forEach {
                    descExactList.add(it.groupValues[1])
                }

                val textExactList = mutableListOf<String>()
                Regex("""@text=['"]([^'"]+)['"]""").findAll(unescaped).forEach {
                    textExactList.add(it.groupValues[1])
                }

                val descMatchList = mutableListOf<String>()
                Regex("""contains\(\s*@content-desc\s*,\s*['"]([^'"]+)['"]\s*\)""").findAll(unescaped).forEach {
                    descMatchList.add(it.groupValues[1])
                }

                val textMatchList = mutableListOf<String>()
                Regex("""contains\(\s*@text\s*,\s*['"]([^'"]+)['"]\s*\)""").findAll(unescaped).forEach {
                    textMatchList.add(it.groupValues[1])
                }

                val resIdList = mutableListOf<String>()
                Regex("""@resource-id=['"]([^'"]+)['"]""").findAll(unescaped).forEach {
                    resIdList.add(it.groupValues[1])
                }

                var clazz: String? = null
                Regex("""@class=['"]([^'"]+)['"]""").find(unescaped)?.let { clazz = it.groupValues[1] }

                var pkg: String? = null
                Regex("""@package=['"]([^'"]+)['"]""").find(unescaped)?.let { pkg = it.groupValues[1] }

                var scroll: Boolean? = null
                Regex("""@scrollable=['"](true|false)['"]""").find(unescaped)?.let { scroll = it.groupValues[1].toBoolean() }
                var click: Boolean? = null
                Regex("""@clickable=['"](true|false)['"]""").find(unescaped)?.let { click = it.groupValues[1].toBoolean() }
                var enable: Boolean? = null
                Regex("""@enabled=['"](true|false)['"]""").find(unescaped)?.let { enable = it.groupValues[1].toBoolean() }
                var check: Boolean? = null
                Regex("""@checked=['"](true|false)['"]""").find(unescaped)?.let { check = it.groupValues[1].toBoolean() }
                var focusable: Boolean? = null
                Regex("""@focusable=['"](true|false)['"]""").find(unescaped)?.let { focusable = it.groupValues[1].toBoolean() }
                var focused: Boolean? = null
                Regex("""@focused=['"](true|false)['"]""").find(unescaped)?.let { focused = it.groupValues[1].toBoolean() }
                var selected: Boolean? = null
                Regex("""@selected=['"](true|false)['"]""").find(unescaped)?.let { selected = it.groupValues[1].toBoolean() }

                var inst = 0
                Regex("""\]\[(\d+)\]""").find(unescaped)?.let { inst = (it.groupValues[1].toIntOrNull() ?: 1) - 1 }
                    ?: Regex("""\)\s*\[(\d+)\]""").find(unescaped)?.let { inst = (it.groupValues[1].toIntOrNull() ?: 1) - 1 }

                val tag = unescaped.substringAfter("//").substringBefore("[").substringBefore("/").substringBefore(")")
                if (tag.isNotEmpty() && tag != "*" && clazz == null) {
                    clazz = tag
                }

                return LocatorCriteria(
                    resourceId = resIdList.firstOrNull(),
                    resIdOptions = resIdList,
                    textMatch = textMatchList.firstOrNull(),
                    textMatchOptions = textMatchList,
                    textExact = textExactList.firstOrNull(),
                    textOptions = textExactList,
                    contentDescMatch = descMatchList.firstOrNull(),
                    contentDescMatchOptions = descMatchList,
                    contentDescExact = descExactList.firstOrNull(),
                    contentDescOptions = descExactList,
                    className = clazz,
                    packageName = pkg,
                    isScrollable = scroll,
                    isClickable = click,
                    isEnabled = enable,
                    isChecked = check,
                    isFocusable = focusable,
                    isFocused = focused,
                    isSelected = selected,
                    instance = inst.coerceAtLeast(0),
                    isOrMatch = false
                )
            }

            // 6. Default / Fallback: literal text or accessibility description
            return LocatorCriteria(
                textMatch = unescaped,
                contentDescMatch = unescaped,
                isOrMatch = true
            )
        }
    }
}
