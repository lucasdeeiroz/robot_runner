# 🛠️ Guía de Instalación y Configuración

Esta guía cubre los requisitos previos y los pasos necesarios para que **Robot Runner** esté completamente operativo en su sistema.

---

## 📋 Requisitos Previos del Sistema

Antes de ejecutar la aplicación, asegúrese de tener instaladas y configuradas las siguientes herramientas:

### 1. Android Debug Bridge (ADB)
- Requerido para todas las interacciones con los dispositivos.
- **Ruta**: Asegúrese de que `adb` esté en el `PATH` de su sistema.
- **Prueba**: Ejecute `adb devices` en su terminal.

### 2. Scrcpy
- Requerido para la duplicación de pantalla de alto rendimiento.
- **Ruta**: Asegúrese de que `scrcpy` esté instalado y sea accesible a través de `PATH`.
- **Descarga**: [scrcpy GitHub](https://github.com/Genymobile/scrcpy)

### 3. Python y Robot Framework
- **Python 3.8+**: Requerido para ejecutar suites de pruebas.
- **Robot Framework**: Instale vía pip: `pip install robotframework`
- **AppiumLibrary**: Instale vía pip: `pip install robotframework-appiumlibrary`

---

## 🚀 Detección de Herramientas al Iniciar

Robot Runner recuerda qué herramientas se encontraron en la última apertura, por lo que abre **al instante** y confirma todo en segundo plano.

**Aperturas normales (herramientas ya detectadas antes):**

1. La app abre **sin pantalla de carga**, aplicando las versiones guardadas en la última apertura.
2. Una pequeña píldora en la parte inferior de la pantalla muestra **"Confirmando versiones de las herramientas... X/Y"** mientras cada herramienta se verifica de nuevo en segundo plano.
3. Si algo cambió desde la última apertura (se instaló o eliminó una herramienta, o cambió la ruta personalizada de ADB), la funcionalidad relacionada se activa o desactiva automáticamente y una notificación lista las herramientas que cambiaron. Si **ADB** ya no se encuentra, se muestra la pantalla **Herramientas Críticas Faltantes**.

**Primera apertura (o al cambiar de modo de uso / framework por primera vez):** todavía no hay versiones guardadas, así que se ejecuta la detección a continuación. Solo **ADB** bloquea el inicio — todo lo demás se identifica en segundo plano.

1. **Al abrir la app**: se muestra una breve pantalla de carga **solo mientras se localiza ADB**. Normalmente tarda alrededor de un segundo.
2. **ADB encontrado**: la pantalla de carga se cierra y la app ya se puede usar (lista de dispositivos, Inspector, Mapper, Toolbox, etc.).
3. **ADB no encontrado**: se muestra la pantalla **Herramientas Críticas Faltantes** con un enlace para descargar Platform Tools, ya que nada funciona sin ADB.
4. **Detección en segundo plano**: mientras se identifican las demás herramientas (Scrcpy, Node.js, Appium, UiAutomator2, Python, Robot Framework, AppiumLibrary, Java, Maven, Maestro, Ngrok, Claude Code, Antigravity), una pequeña píldora en la parte inferior de la pantalla muestra **"Identificando herramientas en segundo plano... X/Y"**.
5. **Funcionalidades habilitadas una a una**: cada funcionalidad se activa en cuanto se confirman las herramientas de las que depende:
   - Pestaña **Launcher** (página Run) — espera las herramientas de prueba del framework seleccionado (ej.: Python + Robot Framework + AppiumLibrary). Mientras está pendiente, su tooltip indica **"Verificando herramientas necesarias..."**. Si no eligió otra pestaña, la app cambia al Launcher automáticamente cuando queda disponible.
   - Botón de **espejado de pantalla** (Toolbox) — espera **Scrcpy**.
   - Botón **Iniciar Appium** (Configuración) — espera **Node.js**, **Appium** y **UiAutomator2**.
   - Tarjeta de **acceso remoto** (Connect) — espera **Ngrok** (solo cuando Ngrok está habilitado).
6. **Herramientas opcionales faltantes**: al terminar la detección en segundo plano, si falta alguna herramienta de prueba o de espejado, se muestra el aviso habitual para que pueda instalarla.
7. **Configuración > Versiones del Sistema**: las herramientas que aún se están verificando muestran un indicador **Verificando...** y se completan en cuanto cada una es identificada. Al hacer clic en **Actualizar** se ignoran las versiones guardadas y se leen todas las herramientas de nuevo desde cero — úselo justo después de instalar o actualizar una herramienta.

---

## 🔧 Configuración Inicial

Después de iniciar Robot Runner, navegue a la pestaña de **Configuración (Settings)** para finalizar la configuración.

### 1. Configuración de Rutas (Paths)
- **Directorio de Suites**: La ubicación predeterminada donde se almacenan sus archivos `.robot`.
- **Raíz de Automatización (Automation Root)**: La "Raíz" de su proyecto. Esto es fundamental para resolver rutas relativas en sus suites (ej: `Resource ../resources/common.resource`).
- **Directorio de Reportes**: Donde desea que se guarden los registros e informes de ejecución de pruebas.

### 2. Proveedores de IA (Opcional pero muy recomendado)
Para usar las funciones de Mapeo con IA y Generador de IA, debe proporcionar una clave de API (API Key) para uno de los siguientes:
- **Google Gemini**: [Obtener API Key](https://aistudio.google.com/app/apikey)
- **OpenAI**: [Obtener API Key](https://platform.openai.com/api-keys)
- **Anthropic (Claude)**: [Obtener API Key](https://console.anthropic.com/settings/keys)

### 3. Servidor Appium
Robot Runner asume que un servidor Appium se está ejecutando o será administrado por sus scripts.
- **Nota**: Asegúrese de que la versión del servidor Appium sea compatible con su versión de `AppiumLibrary`.

---

## 🏗️ Configuración de Desarrollo (Para Colaboradores)

Si tiene la intención de compilar Robot Runner desde el código fuente:

1. **Instalar Rust**: [rustup.rs](https://rustup.rs/)
2. **Instalar Node.js**: [nodejs.org](https://nodejs.org/)
3. **Clonar el Repositorio**: `git clone https://github.com/lucasdeeiroz/robot_runner.git`
4. **Instalar Dependencias**: `npm install`
5. **Ejecutar en Modo de Desarrollo**: `npm run tauri dev`
6. **Compilar Aplicación de Producción**: `npm run tauri build`

### 🚀 Publicar una Release (Mantenedores)

Las releases están totalmente automatizadas por `.github/workflows/release.yml`. Los únicos pasos manuales son:

1. **Actualizar la versión**: `node scripts/bump_version.js 3.0.1-beta1` (actualiza `package.json`, `tauri.conf.json`, `Cargo.toml`, el Companion y la configuración del MSI).
2. **Hacer commit y crear la tag**: `git commit -am "chore: bump version to 3.0.1-beta1"` y luego `git tag v3.0.1-beta1`.
3. **Enviar la tag**: `git push origin v3.0.1-beta1`.

A partir de ahí el workflow, sin ninguna intervención:

- **Valida** que la tag coincida con todas las versiones del proyecto (falla al inicio indicando el comando exacto para corregirlo).
- **Genera las notas de la release** a partir de los commits desde la tag anterior, agrupados en Features / Improvements / Bug Fixes, etc., con una tabla de descargas para cada plataforma. Las releases estables listan los cambios desde la última release **estable**.
- **Compila** Windows, macOS, Linux y el APK del Companion, y **falla si falta algún archivo esperado**.
- **Publica** la release con un `SHA256SUMS.txt` solo después de que todos los builds hayan tenido éxito.
- **Canales**: las tags con `-alpha`, `-dev`, `-beta` o `-rc` se publican como **pre-release** (no se ofrecen al canal de actualización Stable ni se envían a Winget). Las tags `-stableN` y `X.Y.Z` simples son releases **estables**.
- **Winget**: las releases estables se envían automáticamente cuando el secret `WINGET_TOKEN` está configurado.

Para recompilar una tag existente, abra **Actions > Release > Run workflow** e indique la tag (ej.: `v3.0.1-beta1`).

**Firma del Companion (configuración única):** para que los usuarios actualicen `companion.apk` sin desinstalarlo, cree una keystore de release y registre estos secrets en el repositorio: `COMPANION_KEYSTORE_BASE64` (el archivo `.jks` en Base64), `COMPANION_KEYSTORE_PASSWORD`, `COMPANION_KEY_ALIAS` y `COMPANION_KEY_PASSWORD`. Sin ellos, el APK se firma con una clave de debug temporal y el workflow muestra una advertencia.
