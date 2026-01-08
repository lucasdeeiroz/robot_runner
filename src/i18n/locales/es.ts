export const es = {
    translation: {
        sidebar: {
            run: "Ejecutar",
            description_run: "Gestión de dispositivos y ejecución de automatización.",
            tests: "Pruebas",
            description_tests: "Historial de ejecuciones y análisis de resultados.",
            ai_assistant: "Asistente IA",
            settings: "Configuración",
            description_settings: "Configure las preferencias e integraciones de la aplicación.",
            about: "Acerca de",
            description_about: "Información sobre Robot Runner y sus creadores."
        },
        run_tab: {
            launcher: "Lanzador",
            connect: "Conectar",
            inspector: "Inspector",
            commands: "Comandos",
            device: {
                no_device: "Ningún Dispositivo",
                selected_count: "{{count}} Seleccionados",
                select: "Seleccionar Dispositivos",
                busy: "Ocupado",
                refresh: "Actualizar"
            }
        },
        tests: {
            mode: {
                file: "Archivo de Prueba",
                folder: "Carpeta de Pruebas",
                args: "Archivo de Args"
            },
            target: "Objetivo",
            no_selection: "Sin selección válida",
            run_all: "Ejecutar Todas",
            run_selected: "Ejecutar Seleccionada",
            status: {
                checking: "Verificando Appium...",
                starting: "Iniciando Appium...",
                launching: "Iniciando Pruebas...",
                redirecting: "Redirigiendo...",
                failed: "Fallo al iniciar"
            },
            alerts: {
                busy: "Los siguientes dispositivos están ocupados:\n{{devices}}\n\nEspere a que terminen."
            },
            options: {
                dont_overwrite: "No sobrescribir logs"
            }
        },
        connect: {
            wireless: {
                title: "Conexión Inalámbrica",
                desc: "Conectar vía Wi-Fi ADB"
            },
            remote: {
                title: "Acceso Remoto (Ngrok)",
                desc: "Exponer Dispositivo ADB a internet"
            },
            labels: {
                ip: "Dirección IP",
                port: "Puerto",
                code: "Código de Emparejamiento (Opcional)",
                config: "Configuración",
                expose_port: "Puerto Expuesto",
                token: "Token",
                missing_token: "Faltante (Ver Ajustes)"
            },
            actions: {
                connect: "Conectar",
                pair: "Emparejar",
                disconnect: "Desconectar",
                start_tunnel: "Iniciar Túnel Público",
                stop_tunnel: "Detener Túnel",
                copy: "¡Copiado!",
                paste_url: "Pegar URL"
            },
            status: {
                tunnel_active: "Túnel Activo",
                starting_ngrok: "Iniciando Túnel Ngrok...",
                pasted: "Pegado del portapapeles",
                clipboard_invalid: "Formato inválido en portapapeles",
                clipboard_error: "Permiso de portapapeles denegado",
                auto_ip: "IP Auto-detectada: {{ip}}",
                ip_not_found: "No se pudo detectar la IP del dispositivo vía ADB",
                select_device_first: "Seleccione un dispositivo para exponer",
                forwarding: "Redirigiendo a localhost:5555 (ADB)",
                executing_connect: "Conectando...",
                executing_pair: "Emparejando...",
                executing_disconnect: "Desconectando...",
                connection_failed: "Conexión fallida",
                pairing_failed: "Emparejamiento fallido",
                connection_success: "Conectado a {{target}}",
                pairing_success: "Emparejado con éxito con {{target}}",
                disconnection_success: "Desconectado de {{target}}",
                disconnected_all: "Desconectados todos los dispositivos",
                tunnel_stopped: "Túnel Ngrok Detenido",
                tunnel_stop_error: "Error deteniendo Ngrok",
                tunnel_start_error: "Error iniciando Ngrok"
            }
        },
        inspector: {
            empty: "Seleccione un dispositivo para iniciar el Inspector",
            refresh: "Actualizar Fuente",
            modes: {
                inspect: "Modo Inspección",
                tap: "Modo Toque",
                swipe: "Modo Deslizar"
            },
            status: {
                fetching: "Buscando estado...",
                ready: "Listo",
                loading: "Cargando...",
                no_screenshot: "Sin captura de pantalla"
            },
            properties: "Propiedades del Nodo",
            select_element: "Seleccione un elemento en la pantalla",
            attributes: {
                all: "Todos los Atributos",
                xpath: "XPath",
                resource_id: "Resource ID",
                access_id: "Access ID",
                class: "Clase",
                identifiers: "Identificadores"
            },
            nav: {
                home: "Inicio",
                back: "Atrás",
                recents: "Recientes"
            }
        },
        commands: {
            empty: "Seleccione un dispositivo para ejecutar comandos",
            placeholder: "Ingrese comando ADB (ej: 'shell ls -la')",
            waiting: "Esperando comandos...",
            clear: "Limpiar Consola",
            quick: "Rápido",
            saved: "Guardados",
            actions: {
                save: "Guardar",
                send: "Enviar",
                delete_confirm: "¿Eliminar este comando guardado?"
            },
            modal: {
                title: "Guardar Comando Personalizado",
                label: "Etiqueta",
                placeholder: "ej: Listar Archivos",
                command: "Comando",
                cancel: "Cancelar",
                save: "Guardar Comando"
            }
        },
        common: {
            cancel: "Cancelar",
            save: "Guardar",
            error_occurred: "Ocurrió un error: {{error}}",
            delete: "Eliminar",
            edit: "Editar",
            ok: "Aceptar",
            search: "Buscar...",
            loading: "Cargando...",
            minimize: "Minimizar",
            close: "Cerrar"
        },
        settings: {
            title: "Ajustes",
            description: "Configure preferencias e integraciones de la aplicación.",
            paths: "Rutas",
            tools: "Herramientas",
            general: "General",
            language: "Idioma",
            appearance: {
                title: "Apariencia",
                theme: "Tema de la App",
                light: "Claro",
                dark: "Oscuro",
                primary_color: "Color Primario",
                sidebar_logo: "Logo de la Barra Lateral",
                logo_light: "Logo Modo Claro",
                logo_dark: "Logo Modo Oscuro",
                use_default: "Predeterminado (Texto)",
                logo_hint: "Recomendado: PNG, Altura 40px, Ancho Máx 200px"
            },
            appium: {
                title: "Servidor Appium",
                running: "Corriendo (PID: {{pid}})",
                stopped: "Detenido",
                start: "Iniciar Servidor",
                stop: "Detener Servidor",
                logs: "Ver Logs",
                waiting: "Esperando logs...",
                host: "Host",
                port: "Puerto"
            },
            tool_config: {
                appium_args: "Argumentos Appium",
                scrcpy_args: "Argumentos Scrcpy",
                robot_args: "Argumentos Robot Framework",
                app_packages: "Paquetes de Aplicaciones",
                ngrok_token: "Token de Autenticación Ngrok"
            },
            ai: {
                title: "Integración IA (Google Gemini)",
                key: "Clave API",
                placeholder: "Ingrese su Clave API Gemini"
            },
            system: {
                title: "Versiones del Sistema",
                checking: "Verificando versiones...",
                tools: {
                    adb: "ADB",
                    node: "Node.js",
                    appium: "Appium Server (Node.js)",
                    uiautomator2: "UiAutomator2 Driver (Appium)",
                    python: "Python",
                    robot: "Robot Framework (Python)",
                    appium_lib: "Appium Library (Robot Framework)",
                    scrcpy: "Scrcpy",
                    ngrok: "Ngrok (Túneles)"
                }
            },
            folder_select: "Seleccionar Carpeta",
            dir_label: "Directorio {{key}}",
            not_set: "No definido",
            profiles: {
                title: "Perfiles de Configuración",
                create: "Crear Perfil",
                rename: "Renombrar Perfil",
                delete: "Eliminar Perfil",
                name_placeholder: "Nombre del Perfil",
                confirm_delete: "¿Estás seguro de que deseas eliminar este perfil? Esto no se puede deshacer.",
                default: "Predeterminado"
            },
            path_labels: {
                suites: "Directorio de Suites",
                tests: "Directorio de Pruebas",
                resources: "Directorio de Recursos",
                logs: "Directorio de Logs",
                logcat: "Directorio de Logcat",
                screenshots: "Directorio de Capturas de Pantalla",
                recordings: "Directorio de Grabaciones",
                automationRoot: "Raíz de Automatización (Working Dir)"
            }
        },
        toolbox: {
            tabs: {
                console: "Consola de Prueba",
                logcat: "Logcat",
                commands: "Comandos",
                mirror: "Espejo",
                performance: "Rendimiento"
            },
            actions: {
                screenshot: "Capturar Pantalla",
                start_recording: "Grabar Pantalla",
                stop_recording: "Detener Grabación",
                stop_execution: "Detener Ejecución",
                rerun: "Re-ejecutar",
                switch_to_grid: "Cambiar a Cuadrícula",
                switch_to_tabs: "Cambiar a Pestañas"
            }
        },
        file_explorer: {
            up: "Subir Nivel",
            loading: "Cargando...",
            error: "Fallo al cargar directorio",
            reset: "Reiniciar a Raíz",
            empty: "Directorio vacío",
            current: "Directorio actual",
            no_selection: "Sin selección",
            cancel: "Cancelar",
            select_file: "Seleccionar Archivo",
            select_folder: "Seleccionar Carpeta",
            select_generic: "Seleccionar"
        },
        about: {
            description: "Información sobre Robot Runner y sus creadores.",
            long_description: "Una interfaz gráfica moderna y multiplataforma para Robot Framework y Appium, diseñada para simplificar los flujos de automatización de pruebas.",
            developed_by: "Desarrollado por",
            lead: "Desarrollador Principal",
            collaborator: "Desarrolladora Colaboradora",
            powered_by: "Desarrollado con",
            tools_title: "Herramientas Utilizadas",
            tools_desc: "Robot Runner está construido sobre gigantes de código abierto:",
            tools_list: {
                tauri: { name: "Tauri", desc: "Framework ligero para crear aplicaciones de escritorio seguras con tecnologías web." },
                react: { name: "React", desc: "Biblioteca JavaScript para construir interfaces de usuario dinámicas y receptivas." },
                rust: { name: "Rust", desc: "Lenguaje de sistemas que ofrece rendimiento crítico y seguridad de memoria para el backend." },
                vite: { name: "Vite", desc: "Herramienta de compilación de próxima generación para un desarrollo ultrarrápido." },
                appium: { name: "Appium", desc: "Plataforma de automatización líder para pruebas móviles nativas, híbridas y web." },
                robot: { name: "Robot Framework", desc: "Framework de automatización genérico para pruebas de aceptación." },
                tailwind: { name: "TailwindCSS", desc: "Framework CSS de utilidad primero para un estilo rápido y consistente." },
                lucide: { name: "Lucide", desc: "Biblioteca de iconos vectoriales hermosa y consistente." }
            },
            legal_title: "Términos y Licencia",
            license: "Licencia MIT",
            license_desc: "Por la presente se otorga permiso, sin cargo, a cualquier persona que obtenga una copia de este software y los archivos de documentación asociados (el 'Software'), para utilizar el Software sin restricciones, incluidos, entre otros, los derechos de uso, copia, modificación, fusión, publicación, distribución, sublicencia y/o venta de copias del Software, y para permitir a las personas a quienes se les proporcione el Software que lo hagan, sujeto a las siguientes condiciones: El aviso de derechos de autor anterior y este aviso de permiso se incluirán en todas las copias o partes sustanciales del Software.",
            disclaimer: "El software se proporciona 'tal cual', sin garantía de ningún tipo, expresa o implícita."
        },
        ai_page: {
            title: "Asistente IA",
            powered_by: "Desarrollado con Google Gemini",
            welcome: "¡Hola! Soy tu asistente de Robot Framework, accesible a través de Google Gemini. ¿Cómo puedo ayudarte a escribir o depurar tus pruebas hoy?",
            placeholder: "Pregunta sobre Robot Framework o tus resultados...",
            thinking: "Pensando...",
            error: "Lo siento, encontré un error al conectar con el servicio de IA."
        },
        tests_page: {
            monitoring: "Monitoreo de Pruebas",
            toolbox: "Caja de Herramientas",
            history: "Historial",
            loading: "Cargando historial...",
            no_logs: "No se encontraron registros de ejecución.",
            report: "Informe",
            open_folder: "Abrir Carpeta",
            session_not_found: "Sesión no encontrada.",
            close_tab: "Cerrar Pestaña",
            filter: {
                search: "Buscar logs...",
                period: "Período",
                group_by: "Agrupar por",
                status: "Estado",
                device: "Dispositivo",
                suite: "Suite",
                all_time: "Todo el tiempo",
                today: "Hoy",
                last_7_days: "Últimos 7 días",
                last_30_days: "Últimos 30 días"
            },
            actions: {
                refresh: "Actualizar Lista",
                clear: "Limpiar",
                delete: "Eliminar Log",
                open_launcher: "Abrir en Lanzador"
            },
            unknown_os: "SO Desconocido",
            unknown_model: "Modelo Desconocido",
            charts: {
                status_distribution: "Distribución de Estado",
                group_performance: "Rendimiento por {{group}}",
                select_group: "Seleccione una opción 'Agrupar por' para ver detalles",
                show: "Mostrar Gráficos",
                hide: "Ocultar Gráficos"
            }
        },
        console: {
            waiting: "Esperando salida..."
        },
        logcat: {
            start: "Iniciar",
            stop: "Detener",
            filter: "Filtrar App",
            no_packages: "Ningún paquete configurado",
            level: "Nivel de Log",
            clear: "Limpiar Logs",
            lines: "líneas",
            no_logs: "Ningún log capturado",
            select_device: "Seleccione un dispositivo para ver logs",
            saving: "Guardando logs en:",
            errors: {
                app_not_running: "La aplicación no se está ejecutando: {{pkg}}"
            }
        },
        scrcpy: {
            title: "Duplicación de Pantalla",
            description: "Inicie Scrcpy para duplicar y controlar la pantalla de este dispositivo en una ventana separada.",
            start: "Iniciar Duplicación",
            starting: "Iniciando...",
            note: "Nota: Scrcpy debe estar instalado en el PATH de su sistema. La ventana de espejo se ejecuta de forma independiente.",
            error: "Fallo al iniciar Scrcpy. Asegúrese de que esté instalado y en su PATH."
        },
        performance: {
            title: "Rendimiento del Dispositivo",
            auto_on: "Auto-Actualizar Encendido",
            auto_off: "Auto-Actualizar Apagado",
            refresh: "Actualizar Ahora",
            cpu: "Uso de CPU",
            ram: "Uso de RAM",
            battery: "Batería",
            load: "carga",
            used: "usado",
            loading: "Cargando estadísticas...",
            error: "Fallo al obtener estadísticas del dispositivo",
            start_record: "Iniciar Grabación",
            stop_record: "Detener Grabación",
            recording: "Grabando...",
            record_error: "Fallo al grabar",
            select_device: "Seleccione un dispositivo para ver estadísticas de rendimiento.",
            system_only: "Solo Sistema",
            device_stats: "Rendimiento del Dispositivo",
            app_stats: "Rendimiento de la Aplicación",
            auto: "Auto"
        },
        feedback: {
            success: "Éxito",
            error: "Error",
            saved: "Guardado exitosamente",
            test_started: "Ejecución de Prueba Iniciada",
            test_finished: "Ejecución de Prueba Finalizada",
            test_passed: "Suite de Prueba Aprobada",
            test_failed: "Suite de Prueba Fallida",
            appium_started: "Servidor Appium Iniciado",
            appium_stopped: "Servidor Appium Detenido",
            adb_connected: "ADB Inalámbrico Conectado",
            remote_connected: "Acceso Remoto Conectado",
            recording_saved: "Grabación de Pantalla Guardada",
            inspector_updated: "Inspector Actualizado",
            logcat_saved: "Logcat Guardado",
            performance_saved: "Estadísticas de Rendimiento Guardadas",
            mirror_launched: "Espejo Iniciado",
            screenshot_saved: "Captura de Pantalla Guardada",
            profile_changed: "Perfil de Configuración Cambiado",
            details: {
                device: "Dispositivo: {{device}}",
                path: "Ruta: {{path}}",
                url: "URL: {{url}}"
            }
        },
        startup: {
            loading: "Inicializando aplicación...",
            checking: "Verificando herramientas del sistema...",
            critical: {
                title: "Herramientas Críticas Faltantes",
                description: "Las siguientes herramientas son necesarias para ejecutar esta aplicación:",
                action: "Salir de la Aplicación"
            },
            testing: {
                title: "Herramientas de Prueba Faltantes",
                description: "Faltan algunas herramientas necesarias para la automatización:",
                note: "Aún puede usar otras funciones, pero la ejecución de pruebas estará deshabilitada.",
                action: "Configurar"
            },
            mirroring: {
                title: "Herramienta de Duplicación Faltante",
                description: "Scrcpy es necesario para la duplicación de pantalla:",
                note: "La duplicación de pantalla estará deshabilitada.",
                action: "Continuar"
            }
        }
    }
};
