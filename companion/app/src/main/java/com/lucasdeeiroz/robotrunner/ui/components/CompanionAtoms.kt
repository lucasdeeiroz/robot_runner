package com.lucasdeeiroz.robotrunner.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun CompanionCard(
    modifier: Modifier = Modifier,
    backgroundColor: Color = MaterialTheme.colorScheme.surfaceVariant,
    cornerRadius: Dp = 18.dp,
    content: @Composable ColumnScope.() -> Unit
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(cornerRadius),
        colors = CardDefaults.cardColors(containerColor = backgroundColor)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            content()
        }
    }
}

@Composable
fun CompanionSectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    accentColor: Color = Color(0xFF38BDF8),
    fontSize: TextUnit = 15.sp,
    trailingContent: (@Composable () -> Unit)? = null
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.weight(1f)
        ) {
            Surface(
                color = accentColor,
                shape = RoundedCornerShape(2.dp),
                modifier = Modifier.size(4.dp, 16.dp)
            ) {}
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = title,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = fontSize,
                fontWeight = FontWeight.Bold
            )
        }
        trailingContent?.invoke()
    }
}

@Composable
fun CompanionStatusBadge(
    text: String,
    badgeColor: Color = Color(0xFF10B981)
) {
    Surface(
        color = badgeColor.copy(alpha = 0.2f),
        shape = RoundedCornerShape(12.dp)
    ) {
        Text(
            text = text,
            color = badgeColor,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
fun CompanionActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.primary,
    contentColor: Color = MaterialTheme.colorScheme.onPrimary,
    isOutlined: Boolean = false,
    enabled: Boolean = true
) {
    if (isOutlined) {
        OutlinedButton(
            onClick = onClick,
            enabled = enabled,
            modifier = modifier,
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = containerColor)
        ) {
            Text(text = text, fontWeight = FontWeight.Bold, fontSize = 11.5.sp)
        }
    } else {
        Button(
            onClick = onClick,
            enabled = enabled,
            modifier = modifier,
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = containerColor, contentColor = contentColor)
        ) {
            Text(text = text, fontWeight = FontWeight.Bold, fontSize = 11.5.sp)
        }
    }
}
