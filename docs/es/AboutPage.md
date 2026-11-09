# Página Acerca De

Proporciona metadatos sobre la compilación actual, licencias y mecanismos de actualización de Robot Runner.

### Características Clave

- **Control de Versiones:** Muestra la versión semántica actual del cliente instalado.
- **Canales de Actualización:** Seleccione entre los canales de actualización `stable`, `beta` o `alpha`.
- **Actualizaciones OTA:** Haga clic en el botón de buscar actualizaciones para activar el actualizador incorporado de Tauri.
- **Información de Arquitectura:** Enumera las tecnologías subyacentes que impulsan la herramienta.

### Integridad de la Actualización (Versión Portátil)
Al actualizar la versión **portátil**, Robot Runner verifica la descarga antes de reemplazar el ejecutable:
1. El archivo de actualización se descarga desde la release de GitHub.
2. La aplicación descarga `SHA256SUMS.txt` de la **misma release** y calcula el SHA-256 del archivo descargado.
3. El ejecutable solo se reemplaza si los hashes **coinciden**. Solo se aceptan nombres de archivo simples de la release (`Robot.Runner_*`); cualquier otro nombre de asset se rechaza.
4. Si `SHA256SUMS.txt` no existe, no tiene una entrada para el archivo o el hash no coincide, la actualización se **rechaza**, el archivo descargado se elimina y se le indica que descargue la nueva versión manualmente desde la página **Releases** de GitHub.

### Cómo Usar
Haga clic en el icono de Información en la esquina inferior izquierda. Use esta página para forzar una verificación manual de actualización.
