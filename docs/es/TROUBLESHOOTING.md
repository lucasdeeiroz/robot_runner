# ⚠️ Problemas Conocidos y Solución de Problemas (Troubleshooting)

Este documento rastrea los problemas comunes y proporciona soluciones para los problemas más frecuentes encontrados en **Robot Runner**.

---

## 📱 Problemas de Conexión del Dispositivo

### Dispositivo no detectado
- **Causa**: La Depuración USB está deshabilitada o faltan los controladores (drivers).
- **Solución**:
    1. Habilite las **Opciones de desarrollador** y la **Depuración USB** en su dispositivo.
    2. Para Windows, asegúrese de tener instalados los **Controladores USB de Google**.
    3. Ejecute `adb kill-server` seguido de `adb devices` para restablecer la conexión.

### Estado "No Autorizado (Unauthorized)" en la lista de dispositivos
- **Causa**: El dispositivo no ha aceptado la huella digital de la clave RSA.
- **Solución**: Verifique la pantalla de su dispositivo para un mensaje de permiso y seleccione "Permitir siempre desde esta computadora".

---

## 🖥️ Problemas de Duplicación e Inspector

### Scrcpy no se inicia
- **Causa**: Scrcpy no está en el `PATH` del sistema o hay otra herramienta de duplicación activa.
- **Solución**:
    1. Verifique que `scrcpy --version` funcione en su terminal.
    2. Cierre otras aplicaciones que puedan estar usando la conexión ADB (por ejemplo, Android Studio, otros inspectores).
    3. Disminuya la resolución/tasa de bits en Configuración > Duplicación (Mirroring).

### El Inspector muestra una jerarquía vacía
- **Causa**: La sesión de Appium o ADB agotó el tiempo de espera, o la aplicación usa una vista personalizada que impide el volcado XML.
- **Solución**:
    1. Actualice el inspector manualmente.
    2. Asegúrese de que la aplicación esté en primer plano y no en una pantalla segura (por ejemplo, pantallas de inicio de sesión con `FLAG_SECURE`).

---

## ⚡ Errores de Ejecución

### Errores de "Recurso no encontrado" o Importación
- **Causa**: Configuración incorrecta de la **Raíz de Automatización (Automation Root)**.
- **Solución**: Vaya a Configuración y asegúrese de que la **Raíz de Automatización** esté configurada en el directorio base de su proyecto, y NO en la carpeta de suites.

### La variable `${udid}` está vacía
- **Causa**: Prueba iniciada sin seleccionar un dispositivo o con anulación de variable manual.
- **Solución**: Seleccione siempre un dispositivo del menú desplegable antes de hacer clic en "Ejecutar (Run)". No defina una variable `${udid}` personalizada en sus archivos Robot si desea usar la inyección automática.

---

## 🧠 Problemas de IA y Generador

### Error de "Falta la clave API"
- **Causa**: El proveedor de IA seleccionado no tiene ninguna clave configurada.
- **Solución**: Verifique Configuración > IA y asegúrese de que la clave para su proveedor seleccionado (Gemini, OpenAI o Claude) esté pegada correctamente.

### El análisis de IA falla para registros muy grandes
- **Causa**: Se excedió el límite de la ventana de contexto para el modelo seleccionado.
- **Solución**: Intente usar un modelo con una ventana de contexto más grande (por ejemplo, `gemini-1.5-pro` o `gpt-4-turbo`) o ejecute conjuntos de pruebas más pequeños.

---

## ⚡ Problemas de Rendimiento

### Latencia de la interfaz de usuario con registros (logs) muy grandes
- **Estado**: Limitación conocida del sistema de renderizado recursivo.
- **Detalle**: Los conjuntos de pruebas con miles de nodos anidados (palabras clave/pasos) pueden causar un retraso durante el renderizado inicial del árbol.
- **Mitigación**: 
    1. Contraiga las secciones que no se encuentran actualmente bajo investigación.
    2. Divida los conjuntos de pruebas muy grandes en archivos más pequeños y modulares.
    3. Utilice las funciones "Buscar" o "Filtro", si están disponibles, para acotar la vista.
