# 📖 Guía del Usuario: Primeros Pasos con Robot Runner

Este documento proporciona una descripción general completa de cómo utilizar **Robot Runner** para administrar su flujo de trabajo de automatización de Android.

---

## 📱 Gestión de Dispositivos

### Conexión del Dispositivo
Robot Runner puede conectarse a dispositivos de 4 formas diferentes. Debe tener ADB instalado y configurado en su computadora para usar esta función. Puede obtenerlo en https://developer.android.com/studio/releases/platform-tools.
- **USB**: Simplemente conecte su dispositivo Android con la **Depuración USB** habilitada. Robot Runner lo detectará en la lista del Selector de Dispositivos (haga clic en el botón de actualización para refrescar la lista).
- **Inalámbrico (TCP/IP)**: También puede conectar su dispositivo a la computadora a través de Wi-Fi. Tenga en cuenta que el dispositivo y la computadora deben estar en la misma red.
    1. Primero, debe habilitar la **depuración TCP/IP** en el dispositivo usando el puerto 5555 (predeterminado). Puede hacerlo fácilmente en Robot Runner conectando su dispositivo a través de USB por primera vez y haciendo clic en el botón **Enable 5555** en la pestaña **Connect** en la página principal.
    2. La IP y el puerto se completarán automáticamente. Haga clic en el botón **Connect** para conectar.
    3. Una vez conectado, puede desconectar el cable USB. El dispositivo permanecerá conectado a través de Wi-Fi hasta que se cierre la aplicación o se desconecte el dispositivo.
- **Emparejamiento Wi-Fi (Android 11+)**: Utilice la opción "Pair Device" para conectarse mediante un código de emparejamiento.
    1. Primero, debe habilitar la **Depuración inalámbrica** en el dispositivo.
    2. La IP y el puerto se completarán automáticamente. Ingrese el código de emparejamiento que se muestra en la pantalla del dispositivo. Haga clic en el botón **Pair** para emparejar. Solo tendrá que hacer esto una vez por cada dispositivo.
    3. Si su dispositivo ya está emparejado, simplemente haga clic en el botón **Connect** para conectarlo.
    4. Una vez conectado, puede desconectar el cable USB. El dispositivo permanecerá conectado a través de Wi-Fi hasta que se cierre la aplicación o se desconecte el dispositivo.
- **Remoto a través de ngrok**: Puede compartir su dispositivo con otros habilitando la conexión remota. El dispositivo se conectará a través de un túnel ngrok.
    1. Primero, debe habilitar la **Conexión Remota** en Robot Runner. Haga clic en el botón **Enable Remote Connection** en la pestaña **Connect** de la página principal.
    2. Lea el mensaje de advertencia y, si está de acuerdo, haga clic en el botón **Enable Ngrok**.
    3. Elija el dispositivo deseado en la lista del Selector de Dispositivos. Luego, haga clic en el botón **Start Public Tunnel**.
    4. Una vez que se establezca el túnel, se mostrará un mensaje "Public Tunnel: [URL]". Puede compartir esta URL con otros para acceder a su dispositivo.
    5. Para detener la conexión remota, haga clic en el botón **Stop Public Tunnel**.
    * Nota: Necesitará tener una cuenta ngrok y una clave API (API key) para usar esta función. Puede obtener una en https://ngrok.com.

### Caja de Herramientas del Dispositivo (Device Toolbox)
La caja de herramientas del dispositivo ofrece una variedad de opciones para ayudarlo con sus tareas de automatización. Puede acceder a la caja de herramientas haciendo clic en el ícono de la llave inglesa junto al dispositivo deseado en la lista del Selector de Dispositivos. Éstos son algunos de ellos:
- **Duplicación de pantalla a través de scrcpy (Mirroring)**: Refleje la pantalla de su dispositivo en su computadora.
    1. Haga clic en el botón **Screen Mirroring** para abrir una nueva ventana con la pantalla de su dispositivo.
    * Nota: Necesitará instalar scrcpy en su computadora para usar esta función. El directorio donde está instalado debe agregarse a la variable de entorno PATH. Puede obtenerlo en https://github.com/Genymobile/scrcpy.
- **Captura de Pantalla (Screenshot)**: Tome una captura de la pantalla de su dispositivo.
    1. Haga clic en el botón **Take Screenshot** para tomar una captura de pantalla de su dispositivo.
    * La captura de pantalla se guardará en la carpeta **screenshots** en el directorio de su proyecto.
- **Grabación de Pantalla (Screen Recording)**: Grabe un video de la pantalla de su dispositivo.
    1. Haga clic en el botón **Start Screen Recording** para comenzar a grabar un video de la pantalla de su dispositivo.
    2. Haga clic en el botón **Stop Screen Recording** para detener la grabación del video.
    * El video se guardará en la carpeta **screen_recordings** en el directorio de su proyecto.
- **Logcat**: Capture registros (logs) de su dispositivo.
    1. Abra la pestaña **Logcat** en la Caja de Herramientas del Dispositivo.
    2. Elija el nivel de registro deseado en el menú desplegable **Level** (Verbose, Debug, Info, Warn, Error, Fatal o Silent).
    3. Elija el nombre del paquete deseado en el menú desplegable **Package** (o cámbielo a "Entire System" para ver todos los registros).
    4. Haga clic en el botón **Start** para comenzar a capturar registros.
    5. Haga clic en el botón **Stop** para dejar de capturar registros.
    * Los registros se guardarán en la carpeta **logs** en el directorio de su proyecto.
- **Rendimiento (Performance)**: Realice un seguimiento de la CPU, la RAM y la batería (temperatura/voltaje) en gráficos en tiempo real.
    1. Abra la pestaña **Performance** en la Caja de Herramientas del Dispositivo.
    2. Haga clic en el botón **REC** para comenzar a recopilar métricas de rendimiento.
    3. Haga clic en el botón **Stop** para dejar de recopilar métricas de rendimiento.
    * Las métricas de rendimiento se guardarán en la carpeta **logs** en el directorio de su proyecto.
- **Comandos ADB**: Ejecute comandos ADB personalizados en su dispositivo.
    1. Abra la pestaña **ADB** en la Caja de Herramientas del Dispositivo.
    2. Escriba su comando ADB en el campo **Command**.
    3. Haga clic en el botón **Run** para ejecutar el comando.
    4. También puede guardar sus comandos ADB para poder ejecutarlos nuevamente más tarde.
- **Administrador de Aplicaciones (App Manager)**: Administre las instalaciones de su aplicación en el dispositivo.
    1. Abra la pestaña **Apps** en la Caja de Herramientas del Dispositivo.
    2. Haga clic en el botón **Install APK** para instalar un archivo APK en su dispositivo.
    3. Puede desinstalar, reinstalar, borrar datos o congelar/descongelar cualquier aplicación en su dispositivo.

---

## 🔍 Inspector de UI y Estrategia de Localización

El Inspector es su herramienta principal para diseñar localizadores de automatización estables.

### Como Inspeccionar
1. Abra la sub-pestaña **Inspector** en la página **Run**.
2. Asegúrese de que su dispositivo esté conectado (consulte la sección Conexión del dispositivo, debe tener habilitada la depuración USB). En el panel de Dispositivos (Devices), seleccione el dispositivo deseado.
3. Haga clic en un elemento en la pantalla o navegue a través de la **Jerarquía (Hierarchy Tree)**.
4. Todos los atributos de los elementos se mostrarán en el panel de **Atributos (Attributes)**.

### Generación de Localizadores
- **Prioridad Automática (Auto-Priority)**: La herramienta sugiere automáticamente el mejor localizador utilizando la jerarquía `resource-id` > `content-desc` > `text`.
- **Localizadores Avanzados (Advanced Locators)**: Seleccione múltiples atributos para crear un `UiSelector` encadenado o XPaths complejos.
- **Validación (Validation)**: Use el campo "Buscar (Search)" para verificar que su localizador identifique de manera única el elemento de destino.

### Interacciones de Pantalla
- **Clic (Click)**: Haga doble clic en un elemento.
- **Deslizar (Swipe)**: Haga clic y arrastre en la pantalla para deslizar en la dirección deseada.
- **Atrás (Back)**: Haga clic en el botón **Back**.
- **Inicio (Home)**: Haga clic en el botón **Home**.
- **Recientes (Recent)**: Haga clic en el botón **Recent**.

### Grabadora de Pasos (Steps Recorder)
1. Abra la sub-pestaña **Inspector** en la página **Run**.
2. Asegúrese de que su dispositivo esté conectado (consulte la sección Conexión del dispositivo, debe tener habilitada la depuración USB). En el panel de Dispositivos, seleccione el dispositivo deseado.
3. Haga clic en el botón **Steps Recorder** para abrir el panel de la grabadora.
4. Elija la interacción que desea realizar (por ejemplo, tocar, deslizar, arrastrar y soltar).
5. Seleccione el elemento con el que desea interactuar (ya sea haciendo clic en él en el espejo o seleccionándolo en la Jerarquía).
6. Cada modo de interacción ofrece diferentes opciones para interactuar con el elemento (por ejemplo, tap, swipe right, long press, etc). Seleccione uno para generar el código de automatización del Robot Framework.
7. Realice todas las interacciones que desea grabar.
8. Puede copiar el código generado para usarlo en su suite de pruebas de Robot Framework.

---

## 🧠 Mapeo con IA y Generador

Robot Runner utiliza IA para cerrar la brecha entre la exploración de la interfaz de usuario y la documentación. Puede usar los datos para generar artefactos que lo ayudarán con sus tareas de control de calidad.

### Mapeo de la Aplicación
1. Abra la sub-pestaña **Mapper** en la página **Dashboard**.
2. Asegúrese de que su dispositivo esté conectado (consulte la sección Conexión del dispositivo, debe tener habilitada la depuración USB). En el panel de Dispositivos, seleccione el dispositivo deseado.
3. Puede guardar la pantalla actual y mapear todos sus elementos manualmente, de esta manera puede tener más control sobre los datos que se envían a la IA.
4. O puede usar la IA para explorar y mapear su aplicación automáticamente, haciendo clic en el botón **Star Autonomous Exploration**. La IA se encargará del proceso de navegación y exploración y guardará los datos en el mapeador.
5. Haga clic en **Open Flowchart** para abrir el editor de diagrama de flujo y ver los datos que se capturaron.

### Generando Artefactos
Utilice el **AI Generator** para transformar las pantallas capturadas en:
- **Casos de Prueba (Gherkin/BDD)**
- **Historias de Usuario y PBI**
- **Reportes de Errores (Bugs)**
- **Modelos de Objetos de Página (POM)**

*Nota: Requiere una clave API válida de Gemini, OpenAI o Claude en la configuración.*

---

## ⚡ Ejecución y Depuración de Pruebas de Automatización

### Modos de Ejecución
1. **Archivo (File)**: Ejecute un solo archivo `.robot`.
2. **Carpeta (Folder)**: Ejecute todas las suites dentro de un directorio.
3. **Argumentos (Args)**: Utilice un archivo `.args` o `.txt` para configuraciones complejas (modo sin cabeza/headless, variables, etc.).

### Raíz de Automatización (Automation Root)
Asegúrese de que su **Raíz de Automatización** esté configurada correctamente en Configuración. Este es el directorio base que se utiliza para resolver rutas relativas para recursos y bibliotecas.

### Variables Inyectadas
Robot Runner proporciona automáticamente estas variables a sus scripts:
- `${udid}`: Número de serie del dispositivo.
- `${device_name}`: Nombre del modelo.
- `${os_version}`: Versión de Android.

### Suites de Pruebas Personalizadas
Puede mezclar y combinar diferentes conjuntos de pruebas para una ejecución de automatización personalizada.
1. Haga clic en el icono junto a cada conjunto de pruebas para seleccionar las pruebas que desea ejecutar. Puede seleccionar múltiples conjuntos de pruebas o pruebas individuales dentro de un conjunto.
2. Asegúrese de que el dispositivo correcto esté seleccionado en la lista del Selector de Dispositivos. Puede seleccionar más de un dispositivo para ejecutar sus pruebas en paralelo.
3. Haga clic en el botón **Run Selected** para ejecutar las pruebas seleccionadas.

### Depuración de Pruebas de Automatización
1. Abra la sub-pestaña **History** en la página **Tests**.
2. Seleccione la ejecución de prueba que desea depurar.
3. Se mostrarán todos los registros (logs) de la prueba y podrá ver el estado de la prueba, la duración y otra información.
4. Puede usar IA para analizar los registros de las pruebas y encontrar la causa raíz de la falla.
