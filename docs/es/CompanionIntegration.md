# Guía de Integración y Arquitectura de Robot Runner Companion

El **Robot Runner Companion** es la aplicación nativa de Android que potencia a **Robot Runner Desktop**, transformando la inspección de pantallas, el mapeo de flujos, la gestión de aplicaciones y la automatización de pruebas móviles en una experiencia de alta velocidad y cero sobrecarga en la computadora.

El Companion es **100% opcional**; todas las funciones de Robot Runner mantienen compatibilidad total y fallbacks graduales mediante ADB estándar cuando el Companion no está instalado.

---

## ⚡ Benchmark de Rendimiento: ADB Puro vs. Robot Runner Companion

Aunque ADB (`Android Debug Bridge`) es la herramienta estándar, presenta severas limitaciones cuando realiza consultas periódicas de telemetría o capturas de la jerarquía de UI. El Companion opera nativamente dentro del sistema operativo Android para superar estos cuellos de botella:

| Función / Métrica | ADB Puro (Sin Companion) | Con Robot Runner Companion | Ganancia de Rendimiento |
|---|---|---|---|
| **Velocidad de Lectura de UI** | ~1.500 – 3.500 ms (`uiautomator dump` congela pantalla) | **~8 ms** (Árbol de Accesibilidad instantáneo) | 🚀 **200x Más Rápido** |
| **Verificación de Textos de UI** | Dump XML lento + transferencia de archivo | **Parseo JSON instantáneo vía `/ui-tree`** | ⚡ **Extracción Instantánea** |
| **Sobrecarga en el SO Host** | Spawns de `adb.exe` cada 1–3s | **0% Sobrecarga de CPU** (Caché `ACTIVE_FORWARDS`) | 🎯 **Zero Desperdicio de CPU** |
| **Lista de Apps e Íconos** | Solo nombres de paquetes (`com.app.name`) | **Nombres Oficiales e Íconos PNG en Alta Resolución** | 🖼️ **Íconos Nativos** |
| **Inyección de Toque (Tap)** | ~400 ms (sobrecarga de proceso `adb shell`) | **~15 ms** (Inyección nativa `dispatchGesture`) | ⚡ **25x Más Rápido** |
| **Soporte POS / Maquinitas** | Denegado (`Permission Denied` en `/proc`) | **Soporte Total a Métricas de Hardware** | 📱 **Compatibilidad Total** |
| **Telemetría de Hardware** | Consultas periódicas pesadas vía `dumpsys` | **REST en Tiempo Real `/telemetry`** (CPU, RAM, Temp) | 📊 **Flujo Continuo** |

---

## 🏗️ Visión General de Arquitectura y Fases de Integración

```
+------------------------------------+          ADB Port Forward (tcp:9876)         +---------------------------------------+
|        Robot Runner Desktop        | <==========================================> |   Android Companion App (Native OS)   |
| (Rust IPC + React + ACTIVE_CACHE)  |             HTTP REST / WebSockets           | (AccessibilityService + REST Engine)  |
+------------------------------------+                                              +---------------------------------------+
```

### 1. Caché de Reenvío de Puerto ADB en Memoria (`ACTIVE_FORWARDS`)
Para prevenir la creación excesiva de procesos `adb.exe` en Windows/macOS/Linux durante lecturas periódicas, el backend en Rust mantiene el caché concurrente `ACTIVE_FORWARDS`. El reenvío de puerto (`adb forward tcp:9876 tcp:9876`) se ejecuta **exactamente 1 vez por sesión de dispositivo**. Todas las consultas subsecuentes se ejecutan en **<0.001ms** en memoria.

### 2. Extracción Universal de Texto de UI y Escape de Activities
- **Análisis Doble (JSON y XML)**: El motor `extractTextsFromXml` detecta automáticamente si la respuesta es un XML del uiautomator o un JSON devuelto por el endpoint `/ui-tree` del Companion. Extrae recursivamente los campos `text`, `contentDescription`, `label`, `title`, `name` y `value`.
- **Navegación con Clases Internas**: Intents para abrir pantallas con clases internas (ej: `com.android.settings/.Settings$StatusActivity`) reciben escape automático de shell (`\$`), evitando errores de expansión de variables en la shell de ADB.

### 3. Indicador de Estado Unificado e Interactivo (`CompanionBadge.tsx`)
- Estandarizado en las barras de navegación superiores (`TabBar` en `ToolboxView`, `DeviceCard`, `DeviceViewport`).
- **Variante Ghost Interactiva**: Muestra el ícono animado del **Cohete (🚀)** en modo `'ghost'`. Al hacer clic en el ícono, abre la aplicación Companion y establece la conexión automáticamente.

---

## 🛠️ Guía de Uso y Resolución de Problemas

### Cómo Conectar y Abrir el Companion
1. **Inicio en 1 Clic**: Haga clic en el ícono del **Cohete (🚀)** en cualquier **Device Card** o barra superior para abrir la aplicación en Android y conectar.
2. **Activación Automática de Accesibilidad**: Robot Runner Desktop concede el permiso del servicio de Accesibilidad vía ADB automáticamente al conectar por USB/Wi-Fi.
3. **Verificación de Checkup**: Abra la pestaña **Checkup** para ejecutar diagnósticos POS, listas de verificación de hardware y validación de textos de pantalla contra archivos Golden File.

### Resolución de Problemas
- **El indicador muestra Fallback ADB**: Vuelva a seleccionar el dispositivo en el menú desplegable para renovar el puerto, o haga clic en **Abrir Companion** en la tarjeta del dispositivo.
- **Restricciones Corporativas (MDM)**: En dispositivos corporativos, vaya a `Ajustes de Android > Accesibilidad > Servicios Instalados` y active **Robot Runner Companion**.
