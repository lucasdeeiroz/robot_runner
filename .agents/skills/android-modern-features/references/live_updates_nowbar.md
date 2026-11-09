# Live Updates & Samsung Now Bar (Android 16 / 17 / One UI 9.0)

Este guia cobre a implementação, os requisitos de compatibilidade do AOSP e os segredos de integração com a Samsung Now Bar (pílula dinâmica em tela de bloqueio, AOD e barra de status).

---

## 1. Princípios Fundamentais do AOSP Live Updates (Android 16 / 17 / SDK 36+)

No Android 16 e superior, notificações contínuas de primeiro plano (Foreground Services) podem ser promovidas a **Live Updates** visíveis no topo da barra de status, AOD e Lockscreen, desde que cumpram critérios estritos de elegibilidade.

### Regra de Ouro da Elegibilidade AOSP (`hasPromotableCharacteristics() == true`)
Para que o sistema considere a notificação promovível (`requestedPromotion: true` no SystemUI):
1. **Obrigatoriedade de Estilo Padrão**:
   - O campo `android.template` deve ser **nulo** ou um dos estilos aprovados no framework:
     - `android.app.Notification$BigTextStyle` (`NotificationCompat.BigTextStyle`)
     - `android.app.Notification$ProgressStyle`
     - `android.app.Notification$CallStyle`
     - `android.app.Notification$MetricStyle`
   - **PERIGO / ARMADILHA**: **NUNCA** substitua `android.template` por strings customizadas (ex: `"android.app.Notification$OngoingActivityStyle"`). Isso causa falha imediata e silenciosa em `hasPromotableCharacteristics()`, impedindo o Live Update de ser promovido.
2. **Flag de Promoção Contínua**:
   - `notification.flags = notification.flags or 0x40000` (`FLAG_PROMOTED_ONGOING`).
   - `extras.putBoolean("android.requestPromotedOngoing", true)`.
3. **Texto Crítico e Local Only**:
   - `builder.setLocalOnly(true)` (evita propagação incorreta para relógios sem suporte dedicado).
   - `builder.setShortCriticalText("...")` (texto conciso de chip, ex: `"12m"`, `"Ativo"`).

---

## 2. Samsung One UI 9.0 Now Bar Integration

A Samsung adota a especificação Live Updates do AOSP, mas renderiza sua própria interface proprietária de cápsula/pílula de vidro fosco (**Now Bar**) na base da tela de bloqueio (entre os atalhos de lanterna/câmera) e no AOD.

### Extras Proprietários Mandatórios
Para que a Now Bar extraia título, ícone dedicado e modo de expansão:

```kotlin
val extras = notification.extras ?: Bundle()
val bmpIcon = createMonochromeBitmapIcon(context) // 180x180 ARGB_8888 Bitmap

// 1. Chaves da Pílula / Chip da Now Bar
extras.putInt("android.ongoingActivityNoti.style", 1)
extras.putInt("android.ongoingActivityNoti.actionType", 1)
extras.putBoolean("android.ongoingActivityNoti.show", true)
extras.putInt("android.ongoingActivityNoti.chipBgColor", -1)
extras.putCharSequence("android.ongoingActivityNoti.primaryInfo", title)
extras.putCharSequence("android.ongoingActivityNoti.secondaryInfo", subtitle)
extras.putCharSequence("android.ongoingActivityNoti.nowbarPrimaryInfo", title)
extras.putCharSequence("android.ongoingActivityNoti.nowbarSecondaryInfo", subtitle)
extras.putCharSequence("android.ongoingActivityNoti.chipExpandedText", shortChipText)
extras.putParcelable("android.ongoingActivityNoti.nowbarIcon", bmpIcon)
extras.putParcelable("android.ongoingActivityNoti.secondIcon", bmpIcon)
extras.putParcelable("android.ongoingActivityNoti.chipIcon", bmpIcon)

// 2. Chaves do Card Expandido (ao tocar na pílula)
extras.putCharSequence("android.ongoingActivityPrimaryInfo", title)
extras.putCharSequence("android.ongoingActivitySecondaryInfo", subtitle)
extras.putParcelable("android.ongoingActivityCardIcon", bmpIcon)
extras.putParcelable("android.ongoingActivityChipIcon", bmpIcon)
extras.putInt("android.ongoingActivityNowBarExpandableType", 1) // 1 = HALF expandable card
extras.putInt("android.ongoingActivityPrimaryAction", 0)

// 3. Cronômetro / Contagem Regressiva (se aplicável)
if (isActive) {
    extras.putLong("android.ongoingActivityChronometerBase", whenMillis)
    extras.putBoolean("android.ongoingActivityChronometerStart", true)
    extras.putBoolean("android.ongoingActivityChronometerCountdown", true)
    extras.putCharSequence("android.ongoingActivityExpandedChipText", shortChipText)
}
```

---

## 3. O "Gatekeeper" da Samsung: `allowOngoingActivity = 1`

Mesmo com todos os extras preenchidos e `hasPromotableCharacteristics=true`, a Samsung One UI **bloqueia** a promoção na Now Bar (`isPromotedState=false`) se o pacote não tiver permissão concedida em `NotificationManagerService.PackagePreferences`.

Apps do sistema como Google Maps e Samsung Health vêm pré-autorizados na lista de recursos (`config_DefaultOngoingActivityAllowPackages`). Para apps de usuário:

### Transação IPC Interna do One UI 9.0
No `INotificationManager` da Samsung:
- **Código de Transação**: `213` (`TRANSACTION_setAllowOngoingActivity`)
- **Método**: `setAllowOngoingActivity(String pkg, int uid, boolean allow)`
- **Verificação**: `isOngoingActivityAllowed(String pkg, int uid)` (Código de Transação `212`)

### Ativação Automática via Reflexão Segura
```kotlin
try {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
    if (nm != null) {
        val setAllowMethod = nm.javaClass.methods.firstOrNull {
            it.name == "setAllowOngoingActivity" && it.parameterTypes.size == 3
        }
        setAllowMethod?.invoke(nm, context.packageName, context.applicationInfo.uid, true)
    }
} catch (_: Throwable) {
    // Ignorado se restrito por assinatura/permissão de plataforma
}
```

### Ativação via Shell ADB (para Desenvolvimento e Testes)
```bash
# 1. Ativar allowOngoingActivity
adb shell service call notification 213 s16 "<PACKAGE_NAME>" i32 <UID> i32 1

# 2. Verificar se retornou 1 (True)
adb shell service call notification 212 s16 "<PACKAGE_NAME>" i32 <UID>
```

---

## 4. Roteiro de Inspeção e Diagnóstico

Para diagnosticar o ciclo de vida da notificação no dispositivo:

1. **Inspecionar AppSettings de Notificação**:
   ```bash
   adb shell dumpsys notification | grep -E "AppSettings.*<PACKAGE>"
   ```
   *Esperado*: `allowOngoingActivity=1`.

2. **Inspecionar SystemUI ActiveNotificationModel**:
   ```bash
   adb shell dumpsys activity service com.android.systemui/.SystemUIService | grep "ActiveNotificationModel.*<PACKAGE>"
   ```
   *Campos críticos esperados no final da linha*:
   - `requestedPromotion=true`
   - `isOngoingActivity=true`
   - `isPromotedState=true`

3. **Verificar Renderização Visual**:
   - Bloquear e acordar tela: `adb shell "input keyevent 26 && sleep 1 && input keyevent 224"`
   - Capturar tela: `adb exec-out screencap -p > lockscreen.png`
   - A pílula deve aparecer centralizada na base da tela de bloqueio e na barra de status.
