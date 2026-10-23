---
name: android-modern-features
description: >-
  Authoritative guide and recipes for implementing cutting-edge modern Android features across AOSP, Jetpack Compose, and OEM ecosystems.
  Use when implementing or debugging:
  (1) Live Updates & Samsung One UI Now Bar ongoing activity encapsulation (Android 16/17);
  (2) Material 3 Expressive (M3X) design, expressive motion, surface containers, and edge-to-edge;
  (3) On-Device GenAI using Google AICore and Gemini Nano.
---

# Android Modern Features Skill

Esta skill fornece fluxos de trabalho, arquiteturas e receitas comprovadas para o desenvolvimento de recursos modernos no ecossistema Android moderno (Android 15, 16 e 17 / SDK 35+ / One UI 9.0+).

---

## 1. Quick Decision Matrix

Quando confrontado com uma tarefa no Android moderno, consulte o fluxo correspondente:

| Necessidade do Usuário | Recurso / API Principal | Documentação Detalhada |
| :--- | :--- | :--- |
| Notificação contínua na barra de status, AOD e Lockscreen | **Live Updates (Android 16+) / Samsung Now Bar (One UI 9)** | [Live Updates & Now Bar Guide](./references/live_updates_nowbar.md) |
| Interface fluida, elástica, com cores dinâmicas e cantos orgânicos | **Material 3 Expressive (M3X) & MotionScheme** | [Material 3 Expressive Guide](./references/material3_expressive.md) |
| IA local, sem custo de rede, privacidade total ou fallback offline | **Google AICore & Gemini Nano (ML Kit GenAI Prompt)** | [AICore & Gemini Nano Guide](./references/aicore_gemini_nano.md) |

---

## 2. Checklist Rápido de Implementação

### A. Live Updates & Samsung Now Bar (Android 16/17)
- [ ] **Não adulterar `android.template`**: Mantenha o template padrão (`NotificationCompat.BigTextStyle`). Qualquer template arbitrário anula a elegibilidade (`hasPromotableCharacteristics() == false`).
- [ ] **Flags de Promoção**: Definir `notification.flags = notification.flags or 0x40000` (`FLAG_PROMOTED_ONGOING`) e `extras.putBoolean("android.requestPromotedOngoing", true)`.
- [ ] **Extras da Now Bar**: Adicionar chaves proprietárias Samsung (`android.ongoingActivityNoti.style`, `nowbarIcon`, `chipExpandedText`, `ongoingActivityNowBarExpandableType = 1`).
- [ ] **Gatekeeper de Permissão (`allowOngoingActivity=1`)**: No One UI, execute via reflexão ou adb a ativação de `setAllowOngoingActivity` para o app atingir `isPromotedState=true`.
- [ ] **Script de Validação**: Execute [`verify_nowbar.sh`](./scripts/verify_nowbar.sh) para verificar `dumpsys notification` e capturar a tela de bloqueio.

### B. Material 3 Expressive (M3X) em Jetpack Compose
- [ ] **Tema Expressivo**: Utilize `MaterialExpressiveTheme` com `motionScheme = MotionScheme.expressive()`.
- [ ] **Camadas de Superfície**: Substitua divisores e sombras por contraste tonal utilizando `surfaceContainer`, `surfaceContainerLow`, `surfaceContainerHigh` e `surfaceContainerHighest`.
- [ ] **Físicas de Mola**: Utilize `spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow)` para transições de escala e expansão.
- [ ] **Edge-to-Edge Rigoroso**: Utilize `enableEdgeToEdge()` e trate insets adequadamente com `WindowInsets.safeDrawing`, `WindowInsets.navigationBars` e `Modifier.imePadding()`.
- [ ] **Superfícies Translúcidas**: Aplique vidro fosco com `Modifier.blur(24.dp)` e `shape = RoundedCornerShape(28.dp)` para barras flutuantes.

### C. Google AICore & Gemini Nano (On-Device AI)
- [ ] **Dependência**: Adicionar `com.google.mlkit:genai-prompt:1.0.0-alpha01`.
- [ ] **Acesso Serial à NPU**: Proteger as chamadas ao cliente local com um `kotlinx.coroutines.sync.Mutex` para evitar conflito de acesso concorrente ao chip.
- [ ] **Tratamento de Estado**: Monitorar `FeatureStatus` (`AVAILABLE`, `DOWNLOADABLE`, `DOWNLOADING`, `UNAVAILABLE`) e guiar o download caso necessário.
- [ ] **Arquitetura Híbrida**: Priorizar Nuvem (Gemini 2.5 Flash) para raciocínio complexo e memória longa, e Nano para fallback offline, pré-filtro e tarefas críticas de latência.

---

## 3. Scripts e Referências Disponíveis

- **Script de Validação Now Bar**: [`scripts/verify_nowbar.sh`](./scripts/verify_nowbar.sh)
- **Referência Completa Live Updates / Now Bar**: [`references/live_updates_nowbar.md`](./references/live_updates_nowbar.md)
- **Referência Completa Material 3 Expressive**: [`references/material3_expressive.md`](./references/material3_expressive.md)
- **Referência Completa AICore & Gemini Nano**: [`references/aicore_gemini_nano.md`](./references/aicore_gemini_nano.md)
