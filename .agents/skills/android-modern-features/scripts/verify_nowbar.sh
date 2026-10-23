#!/bin/bash
# verify_nowbar.sh - Script de diagnóstico e validação do Now Bar / Live Updates no One UI 9 / Android 17
# Uso: ./verify_nowbar.sh <PACKAGE_NAME> [SERIAL]

PACKAGE="${1:-com.lucasdeeiroz.autoreply}"
SERIAL="${2:-RQCY205JX2A}"

ADB_CMD="adb"
if [ -n "$SERIAL" ]; then
    ADB_CMD="adb -s $SERIAL"
fi

echo "============================================================"
echo "Diagnóstico Now Bar / Live Updates para: $PACKAGE"
echo "Dispositivo: $SERIAL"
echo "============================================================"

# 1. Obter UID do pacote
UID=$($ADB_CMD shell pm list packages -U | grep "package:$PACKAGE " | awk -F'uid:' '{print $2}')
if [ -z "$UID" ]; then
    echo "[!] Pacote $PACKAGE não encontrado no dispositivo."
    exit 1
fi
echo "[+] UID do pacote: $UID"

# 2. Verificar AppSettings no NotificationManagerService
echo -e "\n--- [1] Checando AppSettings no NotificationManager ---"
APP_SETTINGS=$($ADB_CMD shell dumpsys notification | grep -E "AppSettings.*$PACKAGE")
echo "$APP_SETTINGS"

if echo "$APP_SETTINGS" | grep -q "allowOngoingActivity=1"; then
    echo "[OK] allowOngoingActivity está ATIVO (1) no sistema!"
else
    echo "[AVISO] allowOngoingActivity NÃO está ativo. Ativando via transação IPC (213)..."
    $ADB_CMD shell service call notification 213 s16 "$PACKAGE" i32 "$UID" i32 1
    CHECK=$($ADB_CMD shell service call notification 212 s16 "$PACKAGE" i32 "$UID")
    echo "Resultado da verificação (Transação 212): $CHECK"
fi

# 3. Verificar SystemUI ActiveNotificationModel
echo -e "\n--- [2] Checando ActiveNotificationModel no SystemUI ---"
SYSTEMUI_DUMP=$($ADB_CMD shell dumpsys activity service com.android.systemui/.SystemUIService | grep "ActiveNotificationModel.*$PACKAGE")

if [ -n "$SYSTEMUI_DUMP" ]; then
    echo "[+] Notificação encontrada no SystemUI:"
    echo "$SYSTEMUI_DUMP" | grep -o -E "(requestedPromotion=[a-z]+|isOngoingActivity=[a-z]+|isPromotedState=[a-z]+)"
else
    echo "[!] Notificação ativa de $PACKAGE não foi encontrada no SystemUI."
fi

# 4. Capturar Lockscreen
echo -e "\n--- [3] Capturando tela de bloqueio com a Now Bar ---"
$ADB_CMD shell "input keyevent 26 && sleep 1 && input keyevent 224"
sleep 1
$ADB_CMD exec-out screencap -p > "nowbar_verification_${PACKAGE}.png"
echo "[+] Screenshot salva em nowbar_verification_${PACKAGE}.png"
echo "============================================================"
