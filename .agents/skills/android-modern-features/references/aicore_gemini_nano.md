# Google AICore & Gemini Nano (Android On-Device AI)

Este documento detalha a arquitetura, pré-requisitos de hardware, ciclo de vida de download e integração da IA local via Android AICore e ML Kit GenAI Prompt API.

---

## 1. Arquitetura do AICore no Android

O **Google AICore** é um serviço de sistema do Android (`android.os.ServiceManager.getService("aicore")`) projetado para executar modelos de fundação (como o **Gemini Nano**) diretamente na NPU/GPU do dispositivo, mantendo a privacidade total dos dados e latência ultrabaixa sem custos de nuvem.

### SDK Oficial: ML Kit GenAI Prompt API
Acesso simplificado sem necessidade de vincular AIDL bruto:
```kotlin
// build.gradle.kts
dependencies {
    implementation("com.google.mlkit:genai-prompt:1.0.0-alpha01")
}
```

---

## 2. Matriz de Compatibilidade de Hardware

O Gemini Nano exige aceleradores de hardware de alta capacidade e NPU dedicada com memória compartilhada expressiva:

| Dispositivo / Chipset | Suporte AICore / Gemini Nano | Observações |
| :--- | :--- | :--- |
| **Snapdragon 8 Gen 3 / 8 Elite** (Galaxy S24 / S25 Ultra, etc.) | **Suportado (Nativo)** | NPU Hexagon de alta performance |
| **Google Tensor G3 / G4** (Pixel 8 Pro, 9 Series) | **Suportado (Nativo)** | Google TPU integrada com AICore no sistema |
| **Snapdragon 8 Gen 1 / 8 Gen 2** | Parcial / Sob avaliação OEM | Sujeito a firmware e atualizações do Play Services |
| **Exynos 2100 / Snapdragon 888** (Galaxy S21, etc.) | **Não Suportado** | Falta de instruções NPU requeridas e memória |

---

## 3. Máquina de Estados e Ciclo de Vida do Modelo

O modelo Gemini Nano não vem embutido no APK; ele é gerenciado pelo AICore e baixado dinamicamente via Google Play Services.

### Estados de Disponibilidade (`FeatureStatus`)
1. `AVAILABLE`: O modelo já está presente no dispositivo e pronto para receber inferências.
2. `DOWNLOADABLE`: O hardware e o sistema são compatíveis, mas os pesos do modelo ainda não foram baixados.
3. `DOWNLOADING`: O download e a compilação do modelo para a NPU estão em andamento.
4. `UNAVAILABLE`: O aparelho não possui hardware compatível, o AICore está ausente ou o firmware não suporta execução local.

### Implementação do Cliente de IA Local
```kotlin
class GeminiNanoClient {
    private val mutex = Mutex()
    private var model: GenerativeModel? = null

    private fun client(): GenerativeModel = model ?: Generation.getClient().also { model = it }

    suspend fun checkStatus(): NanoStatus = try {
        when (client().checkStatus()) {
            FeatureStatus.AVAILABLE -> NanoStatus.AVAILABLE
            FeatureStatus.DOWNLOADABLE -> NanoStatus.DOWNLOADABLE
            FeatureStatus.DOWNLOADING -> NanoStatus.DOWNLOADING
            else -> NanoStatus.UNAVAILABLE
        }
    } catch (e: Throwable) {
        NanoStatus.UNAVAILABLE
    }

    /** Inicia o download e expõe o progresso reativo */
    fun download(): Flow<DownloadStatus> = try {
        client().download()
    } catch (e: Throwable) {
        emptyFlow()
    }

    /** Inferência On-Device com Mutex para acesso serial à NPU */
    suspend fun generate(systemInstruction: String, prompt: String, maxTokens: Int = 256): String? {
        if (checkStatus() != NanoStatus.AVAILABLE) return null
        return mutex.withLock {
            try {
                val request = generateContentRequest(
                    SystemInstruction(systemInstruction),
                    TextPart(prompt)
                ) {
                    temperature = 0.7f
                    maxOutputTokens = maxTokens
                }
                client().generateContent(request).candidates.firstOrNull()?.text?.trim()
            } catch (e: Throwable) {
                null
            }
        }
    }
}
```

---

## 4. Arquitetura Híbrida: Cloud + Edge Fallback

Devido à janela de contexto reduzida do Gemini Nano (tipicamente até alguns milhares de tokens) e sua velocidade em tarefas pontuais, a arquitetura moderna recomendada é **híbrida**:

1. **Uso Primário da Nuvem (Gemini 2.5 Flash / Flash-Lite)**:
   - Respostas completas com histórico profundo, memória de longo prazo, personas detalhadas e regras de negócios complexas.
2. **Uso Primário On-Device (Gemini Nano)**:
   - **Reserva Offline Total**: Se a rede cair, o app continua operante respondendo mensagens essenciais.
   - **Pré-filtro de Segurança / Intenção**: Classificar se uma mensagem recebida necessita ou não de resposta antes de gastar cota de rede.
   - **Latência Zero**: Pequenas tarefas de formatação e sumarização instantânea.
