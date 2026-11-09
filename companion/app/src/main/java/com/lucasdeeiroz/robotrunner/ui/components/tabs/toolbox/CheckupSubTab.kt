package com.lucasdeeiroz.robotrunner.ui.components.tabs.toolbox

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import com.lucasdeeiroz.robotrunner.R
import com.lucasdeeiroz.robotrunner.hardware.CustomFirmwareEngine
import com.lucasdeeiroz.robotrunner.model.HardwareSpecCategory

@Composable
fun CheckupSubTab(
    detailedSpecs: List<HardwareSpecCategory>,
    onLaunchDisplayTest: () -> Unit = {}
) {
    val context = LocalContext.current
    var generatedPdfFile by remember { mutableStateOf<java.io.File?>(null) }
    var showRecipeDialog by remember { mutableStateOf(false) }
    var recipeJsonState by remember { mutableStateOf(CustomFirmwareEngine.getStoredRecipeJson(context)) }
    var evaluatedFwVersion by remember { mutableStateOf(CustomFirmwareEngine.resolveFirmwareVersion(context)) }
    var evaluationResultText by remember { mutableStateOf<String?>(null) }

    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(14.dp),
        contentPadding = PaddingValues(bottom = 100.dp)
    ) {
        // Interactive Hardware Tests Card
        item {
            InteractiveTestsCard(context, onLaunchDisplayTest)
        }

        // Custom POS Firmware Recipe Card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        stringResource(id = R.string.header_firmware_recipe),
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        stringResource(id = R.string.desc_firmware_recipe),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp
                    )

                    Spacer(modifier = Modifier.height(10.dp))

                    if (!evaluatedFwVersion.isNullOrBlank()) {
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
                            ) {
                                Text(
                                    text = stringResource(id = R.string.spec_pos_firmware),
                                    fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                                Text(
                                    text = evaluatedFwVersion ?: "",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.primary
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    Button(
                        onClick = {
                            recipeJsonState = CustomFirmwareEngine.getStoredRecipeJson(context)
                            evaluationResultText = null
                            showRecipeDialog = true
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(stringResource(id = R.string.btn_configure_firmware), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Technical Audit PDF Report Card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(stringResource(id = R.string.header_pdf_audit_report), color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        stringResource(id = R.string.desc_pdf_audit_report),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp
                    )
                    Spacer(modifier = Modifier.height(14.dp))

                    Button(
                        onClick = {
                            val checkupRunner = com.lucasdeeiroz.robotrunner.checkup.HardwareCheckupRunner(context)
                            val checkupResult = checkupRunner.runLocalCheckup()
                            val pdfGen = com.lucasdeeiroz.robotrunner.checkup.PdfReportGenerator(context)
                            val file = pdfGen.generatePdfReport(checkupResult, null) // No UI text result for now
                            generatedPdfFile = file
                            if (file != null) {
                                Toast.makeText(context, context.getString(R.string.msg_pdf_report_generated, file.name), Toast.LENGTH_LONG).show()
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(stringResource(id = R.string.btn_generate_pdf_audit), fontWeight = FontWeight.Bold)
                    }

                    generatedPdfFile?.let { pdfFile ->
                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedButton(
                            onClick = {
                                try {
                                    val uri = androidx.core.content.FileProvider.getUriForFile(
                                        context,
                                        "${context.packageName}.fileprovider",
                                        pdfFile
                                    )
                                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                        type = "application/pdf"
                                        putExtra(Intent.EXTRA_STREAM, uri)
                                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                    }
                                    context.startActivity(Intent.createChooser(shareIntent, context.getString(R.string.btn_share_audit_pdf)))
                                } catch (e: Exception) {
                                    Toast.makeText(context, context.getString(R.string.msg_error_opening_pdf, e.message ?: ""), Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF38BDF8))
                        ) {
                            Text(stringResource(id = R.string.btn_share_pdf_report), fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Golden File JSON Card
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(stringResource(id = R.string.header_golden_json), color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        stringResource(id = R.string.desc_golden_json),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 12.sp
                    )
                    Spacer(modifier = Modifier.height(14.dp))
                    
                    val coroutineScope = androidx.compose.runtime.rememberCoroutineScope()

                    Button(
                        onClick = {
                            coroutineScope.launch {
                                val checkupRunner = com.lucasdeeiroz.robotrunner.checkup.HardwareCheckupRunner(context)
                                val checkupResult = checkupRunner.runLocalCheckup()
                                val file = checkupRunner.exportHardwareGoldenFile(checkupResult)
                                if (file != null) {
                                    Toast.makeText(context, context.getString(R.string.msg_golden_saved, file.name), Toast.LENGTH_LONG).show()
                                } else {
                                    Toast.makeText(context, context.getString(R.string.msg_golden_error), Toast.LENGTH_SHORT).show()
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF6366F1)),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(stringResource(id = R.string.btn_export_golden_json), fontWeight = FontWeight.Bold)
                    }
                }
            }
        }


        items(detailedSpecs) { category ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = category.categoryName,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF38BDF8)
                    )
                    Spacer(modifier = Modifier.height(10.dp))

                    category.items.forEachIndexed { index, item ->
                        // Heuristic: if combined text is long, stack vertically
                        val shouldStack = (item.label.length + item.value.length) > 45

                        if (shouldStack) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                            ) {
                                Text(
                                    text = item.label,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 12.sp
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = item.value,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.fillMaxWidth(),
                                    textAlign = TextAlign.End
                                )
                            }
                        } else {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(
                                    text = item.label,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 12.sp,
                                    modifier = Modifier.weight(1f, fill = false)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = item.value,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    textAlign = TextAlign.End
                                )
                            }
                        }

                        if (index < category.items.size - 1) {
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(vertical = 4.dp))
                        }
                    }
                }
            }
        }
    }

    if (showRecipeDialog) {
        AlertDialog(
            onDismissRequest = { showRecipeDialog = false },
            title = {
                Text(
                    text = stringResource(id = R.string.dialog_title_firmware_recipe),
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp
                )
            },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = stringResource(id = R.string.label_recipe_json),
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    OutlinedTextField(
                        value = recipeJsonState,
                        onValueChange = { recipeJsonState = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(240.dp),
                        textStyle = androidx.compose.ui.text.TextStyle(
                            fontSize = 11.sp,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace
                        ),
                        shape = RoundedCornerShape(8.dp)
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = {
                                recipeJsonState = CustomFirmwareEngine.getDefaultSampleRecipeJson()
                                evaluationResultText = null
                            },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(stringResource(id = R.string.btn_load_template), fontSize = 11.sp)
                        }

                        Button(
                            onClick = {
                                val resolved = CustomFirmwareEngine.evaluateRecipe(recipeJsonState)
                                evaluationResultText = resolved ?: "N/A"
                            },
                            modifier = Modifier.weight(1f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(stringResource(id = R.string.btn_test_recipe), fontSize = 11.sp)
                        }
                    }

                    evaluationResultText?.let { result ->
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = stringResource(id = R.string.label_evaluation_result, result),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.padding(10.dp)
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        CustomFirmwareEngine.saveStoredRecipeJson(context, recipeJsonState)
                        evaluatedFwVersion = CustomFirmwareEngine.resolveFirmwareVersion(context)
                        showRecipeDialog = false
                        Toast.makeText(context, context.getString(R.string.msg_recipe_saved), Toast.LENGTH_SHORT).show()
                    },
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(stringResource(id = R.string.inspector_btn_confirm))
                }
            },
            dismissButton = {
                OutlinedButton(
                    onClick = { showRecipeDialog = false },
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(stringResource(id = R.string.inspector_btn_cancel))
                }
            }
        )
    }
}
