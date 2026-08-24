# Conectar

La pestaña **Conectar** se especializa en la gestión de conexiones inalámbricas (Wireless ADB) y túneles remotos de dispositivos Android.

---

## Características Clave

- **ADB Inalámbrico (Wireless Debugging):** Conexión directa con dispositivos en la misma red Wi-Fi mediante el protocolo TCP/IP de ADB.
- **Emparejamiento Android 11+ (AOSP y One UI):** Soporte completo para emparejamiento seguro con PIN de 6 dígitos y formato estándar `WIFI:T:ADB`.
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

### Flujo 2: Emparejamiento Manual Android 11+ (Sin Cable USB)
En dispositivos con Android 11 o superior (ej: Samsung Galaxy One UI, Google Pixel, Xiaomi):
1. En el móvil, acceda a **Ajustes → Opciones de desarrollador → Depuración inalámbrica**.
2. Active la opción **Depuración inalámbrica**.
3. Toque en **"Vincular dispositivo con código de vinculación"**.
4. Android mostrará una ventana con:
   - **Código de vinculación Wi-Fi:** (ej: `123456`)
   - **Dirección IP y Puerto:** (ej: `192.168.1.50:37485` — *Nota: El puerto de vinculación es dinámico y diferente del puerto 5555*).
5. En Robot Runner Desktop, introduzca la IP, el puerto de vinculación y el código de 6 dígitos en los campos correspondientes.
6. En el botón de acción principal, seleccione **"Emparejar"** (`adb pair <ip>:<puerto_vinculacion> <codigo>`).
7. Tras el éxito del emparejamiento, introduzca el puerto principal de conexión y haga clic en **"Conectar"**.

---

### Flujo 3: Emparejamiento mediante Código QR (`WIFI:T:ADB`)
1. En Robot Runner, el panel **Código QR y Emparejamiento Inalámbrico** genera el formato oficial de AOSP:
   ```text
   WIFI:T:ADB;S:robotrunner-<PIN>;P:<PIN>;;
   ```
2. En Android, en **Depuración inalámbrica → Vincular dispositivo con código QR**, apunte con la cámara al código QR en la pantalla del Desktop.
3. Asegúrese de que ambos dispositivos estén conectados a la misma red Wi-Fi local.
