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
| **Sobrecarga en el SO Host** | Spawns de `adb.exe` cada 1–3s | **0% Sobrecarga de CPU** (Caché de sesión por dispositivo en Rust) | 🎯 **Zero Desperdicio de CPU** |
| **Lista de Apps e Íconos** | Solo nombres de paquetes (`com.app.name`) | **Nombres Oficiales e Íconos PNG en Alta Resolución** | 🖼️ **Íconos Nativos** |
| **Inyección de Toque (Tap)** | ~400 ms (sobrecarga de proceso `adb shell`) | **~15 ms** (Inyección nativa `dispatchGesture`) | ⚡ **25x Más Rápido** |
| **Soporte POS / Maquinitas** | Denegado (`Permission Denied` en `/proc`) | **Soporte Total a Métricas de Hardware** | 📱 **Compatibilidad Total** |
| **Telemetría de Hardware** | Consultas periódicas pesadas vía `dumpsys` | **REST en Tiempo Real `/telemetry`** (CPU, RAM, Temp) | 📊 **Flujo Continuo** |

---

## 🏗️ Visión General de Arquitectura y Fases de Integración

```
+------------------------------------+   ADB forward per device: tcp:19876-19975 -> tcp:9876    +---------------------------------------+
|        Robot Runner Desktop        | <======================================================> |   Android Companion App (Native OS)   |
| (Rust gateway + per-device ports)  |              HTTP REST + X-RR-Token header               | (A11y Service + REST on 127.0.0.1)    |
+------------------------------------+                                                          +---------------------------------------+
```

### 1. Reenvío de Puerto ADB por Dispositivo (Caché de Sesión en Memoria)
Cada dispositivo conectado recibe **su propio puerto local** en el desktop, tomado del rango **19876–19975** y reenviado al puerto **9876** del Companion en ese dispositivo (`adb -s <serial> forward tcp:<puerto_local> tcp:9876`). Como cada dispositivo tiene un puerto local dedicado, **varios dispositivos pueden usar el Companion al mismo tiempo sin conflictos**.

Para prevenir la creación excesiva de procesos `adb.exe` en Windows/macOS/Linux durante lecturas periódicas, el backend en Rust mantiene en memoria, de forma concurrente, una sesión por dispositivo (puerto local + token de sesión). El reenvío se crea **exactamente 1 vez por sesión de dispositivo**; todas las consultas siguientes lo reutilizan sin lanzar nuevos procesos `adb.exe`.

### 2. Extracción Universal de Texto de UI y Escape de Activities
- **Análisis Doble (JSON y XML)**: El motor `extractTextsFromXml` detecta automáticamente si la respuesta es un XML del uiautomator o un JSON devuelto por el endpoint `/ui-tree` del Companion. Extrae recursivamente los campos `text`, `contentDescription`, `label`, `title`, `name` y `value`.
- **Navegación con Clases Internas**: Intents para abrir pantallas con clases internas (ej: `com.android.settings/.Settings$StatusActivity`) reciben escape automático de shell (`\$`), evitando errores de expansión de variables en la shell de ADB.

### 3. Indicador de Estado Unificado e Interactivo (`CompanionBadge.tsx`)
- Estandarizado en las barras de navegación superiores (`TabBar` en `ToolboxView`, `DeviceCard`, `DeviceViewport`).
- **Variante Ghost Interactiva**: Muestra el ícono animado del **Cohete (🚀)** en modo `'ghost'`. Al hacer clic en el ícono, abre la aplicación Companion y establece la conexión automáticamente.

### 4. Seguridad y Refuerzo del Transporte
- **Servidor solo en loopback**: El servidor HTTP del Companion escucha únicamente en el loopback del dispositivo (`127.0.0.1:9876`). **No es accesible** desde la IP Wi-Fi/LAN del equipo; la única entrada es el reenvío ADB creado por el desktop.
- **Token por sesión**: En cada sesión de dispositivo, el desktop genera un token aleatorio y lo entrega al Companion mediante `adb shell am broadcast ... START_SERVER --es AUTH_TOKEN <token>`. Toda solicitud (excepto `GET /ping`) debe enviarlo en el encabezado `X-RR-Token`; las solicitudes sin un token válido se rechazan.
- **Receiver protegido**: El broadcast receiver que inicia/detiene el servidor está protegido por el permiso `android.permission.DUMP`, que posee el usuario de `adb shell` pero no las apps comunes, de modo que otras apps del dispositivo no pueden iniciar el servidor ni inyectar un token.
- **Sin CORS / acceso solo desde el backend**: Se eliminó CORS. El desktop se comunica con el Companion **solo desde el backend en Rust** (nunca directamente desde la interfaz web).
- **Servicios de accesibilidad preservados**: Al habilitar el servicio de accesibilidad del Companion, Robot Runner lo **añade** a la lista de servicios ya habilitados. TalkBack y cualquier otro servicio activo siguen encendidos.
- **Límites del tiempo de inactividad**: El tiempo de inactividad del servidor está limitado entre **60 y 3600 segundos**.
- **Escaneo de flota en LAN desactivado**: La búsqueda P2P de otros dispositivos con Companion en la red local está desactivada; `/fleet/peers` siempre devuelve una lista vacía.
- **Reglas de las recetas de firmware**: En las recetas de firmware personalizado, las reglas `shell` solo permiten `getprop [clave]`, y las reglas `reflection` solo permiten getters/campos estáticos de `android.os.Build`, `android.os.Build$VERSION` y `android.os.SystemProperties`. Cualquier otra regla se rechaza y el valor recurre a `fallbackProps` / `defaultValue`.

---

## 🛠️ Guía de Uso y Resolución de Problemas

### Cómo Conectar y Abrir el Companion
1. **Inicio en 1 Clic**: Haga clic en el ícono del **Cohete (🚀)** en cualquier **Device Card** o barra superior para abrir la aplicación en Android y conectar.
2. **Activación Automática de Accesibilidad**: Robot Runner Desktop concede el permiso del servicio de Accesibilidad vía ADB automáticamente al conectar por USB/Wi-Fi. El Companion se añade a los servicios ya habilitados (ej: TalkBack), sin reemplazarlos nunca.
3. **Verificación de Checkup**: Abra la pestaña **Checkup** para ejecutar diagnósticos POS, listas de verificación de hardware y validación de textos de pantalla contra archivos Golden File.

### Resolución de Problemas
- **El indicador muestra Fallback ADB**: Vuelva a seleccionar el dispositivo en el menú desplegable para renovar el puerto, o haga clic en **Abrir Companion** en la tarjeta del dispositivo.
- **Companion inaccesible en `http://<ip-del-dispositivo>:9876`**: Es el comportamiento esperado. El servidor solo escucha en el loopback del dispositivo y exige el token de sesión; úselo a través de Robot Runner Desktop.
- **Restricciones Corporativas (MDM)**: En dispositivos corporativos, vaya a `Ajustes de Android > Accesibilidad > Servicios Instalados` y active **Robot Runner Companion**.
