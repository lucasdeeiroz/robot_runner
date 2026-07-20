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
