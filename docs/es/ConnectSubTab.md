# Conectar

La pestaña **Conectar** se especializa en la gestión de conexiones inalámbricas (Wireless ADB) y túneles remotos de dispositivos Android.

---

## Características Clave

- **ADB Inalámbrico (Wireless Debugging):** Conexión directa con dispositivos en la misma red Wi-Fi mediante el protocolo TCP/IP de ADB.
- **Emparejamiento Android 11+ (AOSP y One UI):** Emparejamiento seguro usando el código de vinculación Wi-Fi de 6 dígitos que muestra Android (**"Vincular dispositivo con código de vinculación"**).
- **Detección Automática de IP:** Identificación automática de la dirección IP Wi-Fi (`wlan0`) del dispositivo a través de USB.
- **Activación TCP/IP en 1 Clic (5555):** Habilita el puerto 5555 en un dispositivo USB conectado con un solo clic.
- **Túnel Ngrok Integrado:** Exposición segura de los servicios locales a Internet para pruebas remotas.

---

## Flujos de Conexión Inalámbrica

### Flujo 1: Transición Rápida vía USB (Recomendado)
1. Conecte el dispositivo mediante cable USB.
2. En la pestaña **Conectar**, seleccione el dispositivo de destino. Robot Runner completará automáticamente la IP de Wi-Fi (`wlan0`).
3. Haga clic en **"Habilitar 5555"** para activar el modo TCP/IP.
4. Haga clic en **"Conectar"** (`adb connect <ip>:5555`).
5. Tras el mensaje de éxito, puede desconectar el cable USB con seguridad.

---

### Flujo 2: Emparejamiento con Código de Vinculación en Android 11+ (Sin Cable USB)
En dispositivos con Android 11 o superior (ej: Samsung Galaxy One UI, Google Pixel, Xiaomi). El panel **Emparejar con Depuración inalámbrica (Android 11+)** de la pestaña Conectar resume estos mismos pasos y muestra la **IP del PC Host**.
1. Asegúrese de que el teléfono y la computadora estén en la misma red Wi-Fi.
2. En el móvil, acceda a **Ajustes → Opciones de desarrollador → Depuración inalámbrica** y active la opción **Depuración inalámbrica**.
3. Toque en **"Vincular dispositivo con código de vinculación"**.
4. Android mostrará un diálogo con:
   - **Código de vinculación Wi-Fi:** (ej: `123456`)
   - **Dirección IP y Puerto:** (ej: `192.168.1.50:37485` — *Nota: el puerto de vinculación es temporal y diferente del puerto de conexión*).
5. En Robot Runner Desktop, escriba el **Código de vinculación Wi-Fi** en el campo **Código**, y la dirección IP y el puerto de vinculación que muestra ese diálogo en los campos **IP** y **Puerto**.
6. Abra la flecha junto al botón de acción principal y seleccione **"Emparejar"** (`adb pair <ip>:<puerto_vinculacion> <codigo>`).
7. El emparejamiento **no** conecta automáticamente. Tras el éxito del emparejamiento, cierre el diálogo en el teléfono, ingrese la IP y el puerto que se muestran en la **pantalla principal de Depuración inalámbrica** de Android (un puerto distinto al de vinculación) y haga clic en **"Conectar"**.

> **Nota:** El emparejamiento mediante código QR no está soportado. La opción **"Vincular dispositivo con código QR"** de Android requiere que la computadora anuncie un servicio de vinculación por mDNS, algo que Robot Runner no ofrece. Use siempre **"Vincular dispositivo con código de vinculación"**.
