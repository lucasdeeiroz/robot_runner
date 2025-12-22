export const es = {
    translation: {
        sidebar: {
            run: "Ejecutar",
            tests: "Pruebas",
            ai_assistant: "Asistente IA",
            settings: "Ajustes",
            about: "Acerca de"
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
            }
        },
        connect: {
            wireless: {
                title: "Conexión Inalámbrica",
                desc: "Conectar vía Wi-Fi ADB"
            },
            remote: {
                title: "Acceso Remoto (Ngrok)",
                desc: "Exponer servidor Appium a internet"
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
                copy: "¡Copiado!"
            },
            status: {
                tunnel_active: "Túnel Activo",
                starting_ngrok: "Iniciando Túnel Ngrok..."
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
            delete: "Eliminar",
            edit: "Editar",
            ok: "Aceptar",
            search: "Buscar...",
            loading: "Cargando..."
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
                dark: "Oscuro"
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
                app_package: "Paquete de App (Monitoreo)"
            },
            ai: {
                title: "Integración IA (Google Gemini)",
                key: "Clave API",
                placeholder: "Ingrese su Clave API Gemini"
            },
            system: {
                title: "Versiones del Sistema",
                checking: "Verificando versiones..."
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
                rerun: "Re-ejecutar"
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
            lead: "Desarrollador Líder",
            powered_by: "Desarrollado con"
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
            unknown_model: "Modelo Desconocido"
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
            saving: "Guardando logs en:"
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
            select_device: "Seleccione un dispositivo para ver estadísticas de rendimiento."
        }
    }
};
