# Guía de Integración y Arquitectura de Robot Runner Companion

El **Robot Runner Companion** es la aplicación nativa de Android que potencia a **Robot Runner Desktop**, transformando la inspección de pantallas, el mapeo de flujos y la automatización de pruebas móviles en una experiencia de alta velocidad y precisión.

---

## ⚡ ¿Por qué usar el Companion en lugar de ADB Puro?

Aunque ADB (`Android Debug Bridge`) es la herramienta estándar, presenta severas limitaciones cuando se utiliza de forma aislada. El Companion resuelve estos problemas operando directamente dentro del sistema operativo Android:

| Funcionalidad | ADB Puro (Sin Companion) | Con Robot Runner Companion |
|---|---|---|
| **Velocidad de Lectura de UI** | ~3.500 ms (`uiautomator dump` congela pantalla) | **~8 ms** (Lectura instantánea de Accesibilidad) |
| **Carga Útil Visual** | Capturas PNG brutas de 15MB en 4K | Marcos ligeros JPEG 720p comprimidos (**~30KB**) |
| **Inyección de Toque (Tap)** | ~400 ms (sobrecarga de proceso `adb shell`) | **~15 ms** (Inyección nativa `dispatchGesture`) |
| **Soporte POS / Maquinitas** | Denegado (`Permission Denied` en `/proc`) | **Soporte Total** mediante API nativa de Android |
| **Monitoreo de Hardware** | Requiere múltiples comandos `dumpsys` pesados | Lectura continua en tiempo real (mA, mV, °C, NFC) |
| **Reportes Técnicos** | Procesamiento externo en la PC | **Emisión nativa de PDFs** directamente en el dispositivo |

---

## 🚀 Cómo Funciona la Integración

1. **Detección Automática**:
   Al conectar un dispositivo Android por USB o Wi-Fi, Robot Runner Desktop verifica automáticamente si el paquete `com.robotrunner.companion` está instalado.

2. **Conexión de Puente Silencioso**:
   La aplicación establece un reenvío de puerto ADB local (`tcp:9876 tcp:9876`) y habilita automáticamente el servicio de accesibilidad mediante comandos seguros del sistema.

3. **Velocidad Potenciada en Inspector y Mapper**:
   - Aparece un ícono de **Cohete (🚀)** junto al nombre del dispositivo.
   - El **Inspector** y el **Mapeador de Flujos (Mapper)** muestran un indicador flotante `🚀 Companion (~250ms)` confirmando la velocidad máxima.

---

## 🛠️ Diagnóstico y Resolución de Problemas

### ¿El indicador muestra "🐢 ADB (3.4s)" en lugar de Companion?
1. **Verifique la Instalación de la APK del Companion**:
   Vaya a la pestaña **Checkup / Conectar** y haga clic en **Instalar / Actualizar Companion App**.
2. **Reconecte el Dispositivo USB**:
   Al volver a seleccionar el dispositivo en el menú desplegable superior, la aplicación restablecerá el puerto y las autorizaciones automáticamente.
3. **Verifique el Servicio de Accesibilidad**:
   Si su dispositivo cuenta con políticas corporativas MDM, abra `Ajustes de Android > Accesibilidad > Servicios Instalados` y active **Robot Runner Companion**.
