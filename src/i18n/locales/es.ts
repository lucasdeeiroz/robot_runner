export const es = {
    translation: {
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
                maestro: { name: "Maestro", desc: "El framework de pruebas de UI más simple y eficaz para la automatización móvil." },
                maven: { name: "Maven", desc: "Herramienta confiable de automatización de compilaciones utilizada principalmente para proyectos Java." },
                tailwind: { name: "TailwindCSS", desc: "Framework CSS de utilidad primero para un estilo rápido y consistente." },
                lucide: { name: "Lucide", desc: "Biblioteca de iconos vectoriales hermosa y consistente." }
            },
            legal_title: "Términos y Licencia",
            license: "Licencia MIT",
            license_desc: "Por la presente se otorga permiso, sin cargo, a cualquier persona que obtenga una copia de este software y los archivos de documentación asociados (el 'Software'), para utilizar el Software sin restricciones, incluidos, entre otros, los derechos de uso, copia, modificación, fusión, publicación, distribución, sublicencia y/o venta de copias del Software, y para permitir a las personas a quienes se les proporcione el Software que lo hagan, sujeto a las siguientes condiciones: El aviso de derechos de autor anterior y este aviso de permiso se incluirán en todas las copias o partes sustanciales del Software.",
            disclaimer: "El software se proporciona 'tal cual', sin garantía de ningún tipo, expresa o implícita.",
            update_check: "Buscar Actualizaciones",
            update_available: "Nueva versión disponible: {{version}}",
            update_not_available: "Estás actualizado",
            update_error: "Fallo al buscar actualizaciones",
            checking: "Verificando...",
            update_badge: "ACTUALIZACIÓN"
        },
        ai_page: {
            title: "Asistente IA",
            powered_by: "Desarrollado con Google Gemini",
            welcome: "¡Hola! Soy tu asistente de Robot Framework, accesible a través de Google Gemini. ¿Cómo puedo ayudarte a escribir o depurar tus pruebas hoy?",
            placeholder: "Pregunta sobre Robot Framework o tus resultados...",
            thinking: "Pensando...",
            error: "Lo siento, encontré un error al conectar con el servicio de IA."
        },
        apps: {
            fetch_error: "Error al obtener paquetes",
            install_error: "Error al instalar APK",
            actions: {
                uninstall_title: "Desinstalar Paquete",
                uninstall_confirm: "¿Estás seguro de que quieres desinstalar {{pkg}}?",
                disable_title: "Deshabilitar App",
                enable_title: "Habilitar App",
                disable_confirm: "¿Deshabilitar {{pkg}}?",
                enable_confirm: "¿Habilitar {{pkg}}?",
                clear_title: "Borrar Datos",
                clear_confirm: "¿Borrar todos los datos de {{pkg}}?",
                install: "Instalar APK",
                uninstall: "Desinstalar",
                disable: "Deshabilitar",
                enable: "Habilitar",
                clear: "Borrar Datos",
                sort_by_name: "Ordenar por Nombre",
                sort_by_package: "Ordenar por Paquete",
                refresh: "Actualizar Lista"
            },
            search_placeholder: "Buscar paquetes...",
            toggle_system: "Mostrar Apps del Sistema",
            no_device: "Ningún dispositivo seleccionado",
            no_packages: "Ningún paquete encontrado",
            status: {
                installing: "Instalando APK...",
                disabled_badge: "Deshabilitado",
                paused_test: "Actualización de apps pausada por prueba"
            },
            success: {
                uninstalled: "{{pkg}} desinstalado con éxito",
                disabled: "{{pkg}} deshabilitado",
                enabled: "{{pkg}} habilitado",
                cleared: "Datos borrados para {{pkg}}",
                installed: "APK instalado con éxito"
            },
            error: {
                install_failed: "Fallo en la instalación: {{error}}"
            }
        },
        commands: {
            title: "Comandos ADB",
            parse_error: "Error al procesar comandos guardados",
            cancel_error: "Error al cancelar comando",
            empty: "Seleccione un dispositivo para ejecutar comandos",
            input_placeholder: "Ingrese comando ADB (ej: 'shell ls -la')",
            waiting: "Esperando comandos...",
            status: {
                test_running: "Ejecución de prueba en curso"
            },
            clear: "Limpiar Consola",
            quick: "Rápido",
            saved: "Guardados",
            actions: {
                ip_address: "Dirección IP",
                list_packages: "Listar Paquetes",
                battery: "Bateria",
                reboot: "Reiniciar",
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
            saved: "Guardado",
            undo: "Deshacer",
            redo: "Rehacer",
            next: "Siguiente",
            back: "Volver",
            finish: "Finalizar",
            copy: "Copiar",
            copied: "¡Copiado!",
            download: "Descargar",
            downloading: "Descargando...",
            clear: "Limpiar",
            coming_soon: "Módulo {{module}} próximamente...",
            error_occurred: "Ocurrió un error: {{error}}",
            delete: "Eliminar",
            edit: "Editar",
            ok: "Aceptar",
            search: "Buscar...",
            loading: "Cargando...",
            minimize: "Minimizar",
            maximize: "Maximizar",
            close: "Cerrar",
            confirm: "Confirmar",
            attention: "Atención",
            errors: {
                open_file_failed: "Error al abrir archivo o carpeta",
                open_link_failed: "Error al abrir enlace"
            }
        },
        components: {
            logo: {
                load_error: "Error al cargar logo"
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
                copy: "¡Copiado!",
                disconnect: "Desconectar",
                disconnect_all: "Desconectar Todos",
                enable_remote: "Habilitar Conexión Remota",
                enable_tcpip: "Habilitar 5555",
                enable_tcpip_tooltip: "Ejecutar 'adb tcpip 5555'",
                pair: "Emparejar",
                paste_url: "Pegar URL",
                rerun_failed: "Reejecutar Fallos",
                start_tunnel: "Iniciar Túnel Público",
                stop_tunnel: "Detener Túnel"
            },
            status: {
                tunnel_active: "Túnel Activo",
                starting_ngrok: "Iniciando Túnel Ngrok...",
                pasted: "Pegado del portapapeles",
                clipboard_invalid: "Formato inválido en portapapeles",
                clipboard_error: "Permiso de portapapeles denegado",
                auto_ip: "IP Auto-detectada",
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
                tunnel_start_error: "Error iniciando Ngrok",
                payment_required_title: "Pago de Ngrok Requerido",
                payment_required_desc: "Las cuentas gratuitas de ngrok requieren una tarjeta de crédito válida para usar túneles TCP. No se te cobrará.",
                add_card: "Añadir Tarjeta",
                cancel_card: "Cancelar",
                enabling_tcpip: "Habilitando TCP/IP 5555...",
                tcpip_enabled: "TCP/IP 5555 Habilitado",
                tcpip_failed: "Fallo al habilitar TCP/IP"
            },
            security_warning: {
                title: "Advertencia de Seguridad",
                message: "Habilitar la conexión remota (Ngrok) expondrá su dispositivo local a Internet.\n\nAsegúrese de que esto cumpla con las políticas de Seguridad de la Información de su organización antes de continuar.",
                cancel: "Cancelar",
                confirm: "Habilitar Ngrok"
            }
        },
        console: {
            waiting: "Esperando salida..."
        },
        dashboard: {
            description: "Herramientas auxiliares para QA: Generación de escenarios, edición de imágenes y documentación.",
            tabs: {
                scenarios: "Generador de Escenarios",
                images: "Editor de Imágenes",
                history: "Historial",
                mapper: "Mapeador"
            },
            input: {
                title: "Requisitos",
                placeholder: "Pegue aquí sus requisitos o criterios de aceptación..."
            },
            editor: {
                title: "Escenarios Generados",
                placeholder: "Los escenarios generados aparecerán aquí. Puede editar y pegar imágenes..."
            },
            history: {
                title: "Historial de Archivos",
                empty: "Ningún archivo generado."
            },
            image: {
                title: "Editor de Imágenes",
                new: "Nueva Imagen / Pegar",
                open: "Abrir Imagen",
                opened: "¡Imagen Cargada!",
                copy: "Copiar Imagen",
                pasted: "¡Imagen pegada!",
                no_clipboard: "No hay imagen en el portapapeles.",
                copied: "¡Copiado al portapapeles!",
                tools: {
                    cursor: "Cursor",
                    arrow: "Flecha",
                    rect: "Rectángulo",
                    crop: "Área de Recorte"
                }
            },
            actions: {
                generate: "Generar Escenarios",
                generated_success: "CASOS DE PRUEBA GENERADOS CON ÉXITO (vía {{method}})",
                gemini_failed: "Fallo en la generación vía Gemini: {{error}}",
                using_local_generator: "Usando generador local. {{message}}",
                export_xlsx: "Excel (.xlsx)",
                export_docx: "Word (.docx)"
            },
            export: {
                success: "¡Exportado con éxito!",
                error: "Error al exportar"
            }
        },
        devices: {
            load_error: "Error al cargar dispositivos"
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
            recording_started: "Grabación Iniciada",
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
            },
            saved_to_prefix: "Archivo guardado en:"
        },
        file_explorer: {
            list_error: "Error al listar directorio",
            error: "Error accediendo al directorio",
            up: "Subir Nivel",
            loading: "Cargando...",
            reset: "Reiniciar a Raíz",
            empty: "Directorio vacío",
            current: "Directorio actual",
            no_selection: "Sin selección",
            cancel: "Cancelar",
            select_file: "Seleccionar Archivo",
            select_folder: "Seleccionar Carpeta",
            select_generic: "Seleccionar"
        },
        inspector: {
            title: "Inspector",
            update_error: "Error al actualizar inspector",
            input_error: "Error al enviar entrada",
            empty: "Seleccione un dispositivo para iniciar el Inspector",
            refresh: "Actualizar Origen",
            search: {
                placeholder: "Buscar por ID, XPath, etc...",
                clear: "Limpiar búsqueda"
            },
            modes: {
                inspect: "Modo Inspección",
                tap: "Modo Toque",
                swipe: "Modo Deslizar"
            },
            status: {
                fetching: "Buscando estado...",
                ready: "Listo",
                loading: "Cargando...",
                no_screenshot: "Sin captura de pantalla",
                paused_test: "Inspector deshabilitado durante la prueba"
            },
            properties: "Propiedades del Nodo",
            select_element: "Seleccione un elemento en la pantalla",
            nav: {
                home: "Inicio",
                back: "Atrás",
                recents: "Recientes"
            },
            modal: {
                edit_xpath: "Editar XPath",
                edit_selector: "Editar Selector",
                match_type: "Tipo de Coincidencia",
                match_type_equals: "Igual",
                match_type_contains: "Contiene",
                match_type_starts_with: "Comienza Con",
                match_type_ends_with: "Termina Con",
                match_type_regex: "Regex/Matches",
                preferred_attr: "Atributo Preferido",
                preferred_attr_resource_id: "Resource ID",
                preferred_attr_text: "Texto",
                preferred_attr_content_desc: "Content Desc",
                preferred_attr_class: "Solo Clase",
                result: "Resultado",
                use_wrapper: "Usar wrapper new UiSelector()",
                additional_attrs: "Atributos Adicionales",
                attr_resource_id: "Resource ID",
                attr_text: "Texto",
                attr_content_desc: "Content Desc",
                attr_class: "Clase",
                attr_index: "Índice",
                attr_clickable: "Clicable",
                attr_enabled: "Habilitado",
                attr_checked: "Marcado",
                attr_selected: "Seleccionado",
                attr_focusable: "Enfocable"
            },
            attributes: {
                copied: "¡Copiado!",
                all: "Todos los Atributos",
                xpath: "XPath",
                resource_id: "Resource ID",
                access_id: "Accessibility ID",
                class: "Clase",
                identifiers: "Identificadores",
                hierarchy: "Jerarquía"
            }
        },
        logcat: {
            title: "Logcat",
            errors: {
                fetch_failed: "Error al obtener logcat",
                start_failed: "Error al iniciar logcat",
                stop_failed: "Error al detener logcat",
                app_not_running: "Aplicación no se está ejecutando: {{pkg}}"
            },
            status: {
                paused_test: "Logcat pausado durante la prueba",
                waiting: "Esperando logs...",
                empty: "No se capturaron logs"
            },
            saving: "Guardando logcat en",
            start: "Iniciar",
            stop: "Detener",
            filter: "Filtrar App",
            entire_system: "Sistema Completo",
            no_packages: "Ningún paquete configurado",
            level: "Nivel de Log",
            clear: "Limpiar Logs",
            lines: "líneas",
            no_logs: "Ningún log capturado",
            select_device: "Seleccione un dispositivo para ver logs"
        },
        mapper: {
            title: "Mapeador",
            empty: "Seleccione un dispositivo para iniciar el mapeo",
            refresh: "Actualizar Fuente",
            flowchart: {
                open: "Abrir Diagrama de Flujo",
                export: "Exportar Flujo",
                export_image: "Exportar Imagen",
                import: "Importar Flujo",
                export_success: "¡Flujo exportado con éxito!",
                import_success: "¡Flujo importado con éxito!",
                export_error: "Error al exportar flujo.",
                import_error: "Error al importar flujo.",
                quick_connect: "Conexión Rápida",
                source_element: "Elemento de Origen",
                target_screen: "Pantalla de Destino",
                select_element: "Seleccionar Elemento",
                select_target: "Seleccionar Destino",
                connect: "Conectar",
                cancel: "Cancelar",
                no_elements: "No hay elementos asignados disponibles.",
                title: "Flujo de Navegación",
                unsaved_changes: {
                    title: "Cambios no guardados",
                    message: "Tienes cambios no guardados. ¿Quieres guardar antes de salir?",
                    save_and_exit: "Guardar y Salir",
                    exit_without_saving: "Salir sin Guardar",
                    cancel: "Cancelar"
                }
            },
            properties: "Propiedades del Elemento",
            clear_selection: "Limpiar Selección",
            section_title: "Mapeador de Pantalla",
            screen_mapper: "Mapeador de Pantalla",
            screen_settings: "Ajustes de Pantalla",
            saved_screens: "Pantallas Guardadas",
            no_saved_maps: "No se encontraron mapas guardados",
            items: "ítems",
            elements_mapped_count: "{{count}} elementos mapeados",
            elements_mapped: "elementos mapeados",
            select_element: "Seleccione un elemento en la captura de pantalla",
            types: {
                button: "Botón",
                input: "Entrada",
                text: "Texto",
                link: "Enlace",
                toggle: "Alternador",
                checkbox: "Casilla",
                image: "Imagen",
                menu: "Menú",
                scroll_view: "Desplazamiento",
                tab: "Pestaña"
            },
            screen_types: {
                screen: "Pantalla",
                modal: "Modal",
                tab: "Pestaña",
                drawer: "Cajón"
            },
            modes: {
                inspect: "Modo Inspección",
                tap: "Modo Toque",
                swipe: "Modo Deslizar"
            },
            status: {
                fetching: "Obteniendo estado del dispositivo...",
                ready: "Listo",
                loading: "Cargando...",
                no_screenshot: "Sin captura de pantalla",
                paused_test: "Mapeador desactivado durante la prueba"
            },
            nav: {
                home: "Inicio",
                back: "Atrás",
                recents: "Recientes"
            },
            attributes: {
                copied: "¡Copiado!",
                xpath: "XPath",
                resource_id: "Resource ID",
                access_id: "Accessibility ID",
                identifiers: "Identificadores",
                hierarchy: "Jerarquía"
            },
            input: {
                element_type: "Tipo de Elemento",
                element_name: "Nombre del Elemento",
                navigates_to: "Navega A (Opcional)",
                menu_options: "Opciones de Menú (Separadas por comas)",
                parent_screen: "Pantalla Padre",
                select_existing: "Seleccionar Elemento Existente"
            },
            placeholder: {
                select_element: "Elija un elemento para editar...",
                element_name: "ej: Botón de Inicio",
                navigates_to: "Nombre de la Pantalla",
                menu_options: "Opción 1, Opción 2...",
                parent_screen: "Nombre de la Pantalla Padre",
                screen_name: "Nombre de la Pantalla (Único)"
            },
            action: {
                add: "Añadir Mapeo",
                update: "Actualizar",
                remove: "Eliminar",
                save_screen: "Guardar Pantalla",
                load: "Cargar",
                new: "Nuevo",
                discard: "Descartar",
                discard_desc: "Descartar Pantalla",
                delete: "Eliminar"
            },
            feedback: {
                mapped: "¡Elemento mapeado!",
                updated: "Mapeador Actualizado",
                removed: "Mapeo eliminado",
                empty_map: "Aún no hay elementos mapeados",
                saved: "¡Pantalla mapeada con éxito!",
                loaded: "Mapa de pantalla cargado",
                new_screen: "Listo para nueva pantalla",
                deleted: "Mapa eliminado"
            },
            error: {
                missing_name: "Por favor proporcione un nombre para el elemento",
                missing_screen_name: "Por favor proporcione un Nombre para la Pantalla",
                save_failed: "Error al guardar mapa de pantalla"
            },
            confirm: {
                delete: "¿Está seguro de que desea eliminar este mapa?",
                delete_title: "¿Eliminar Mapa de Pantalla?",
                delete_desc: "¿Estás seguro de que deseas eliminar este mapa de pantalla? Esta acción no se puede deshacer.",
                discard: "¿Descartar los cambios actuales?"
            }
        },
        performance: {
            fetch_error: "Error al obtener estadísticas",
            save_error: "Error al guardar datos de rendimiento",
            record_error: "Error al iniciar grabación",
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
            select_device: "Seleccione un dispositivo para ver estadísticas de rendimiento.",
            system_only: "Sistema Completo",
            device_stats: "Rendimiento del Dispositivo",
            app_stats: "Rendimiento de la Aplicación",
            auto: "Auto",
            na: "N/D",
            status: {
                paused_test: "Monitoreo de rendimiento pausado durante la prueba"
            }
        },
        run_tab: {
            launcher: "Lanzador",
            connect: "Conectar",
            inspector: "Inspector",
            commands: "Comandos",
            device: {
                no_device: "Ningún Dispositivo",
                no_devices_found: "No se encontraron dispositivos",
                selected_count: "{{count}} Seleccionados",
                select: "Seleccionar Dispositivos",
                busy: "Ocupado",
                refresh: "Actualizar Dispositivos",
                open_toolbox: "Abrir Caja de Herramientas"
            },
            console: {
                running: "EJECUTANDO",
                pass: "ÉXITO",
                fail: "FALLO",
                test_summary: "{{total}} PRUEBAS: {{passed}} ÉXITOS, {{failed}} FALLOS",
                waiting: "Esperando registros..."
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
        session: {
            stop_error: "Error al detener sesión",
            rerun_error: "Error al reejecutar"
        },
        settings: {
            logo: {
                read_error: "Error al leer archivo de logo. Intente de nuevo.",
                select_error: "Error al seleccionar logo"
            },
            appium: {
                status_error: "Error al obtener estado de Appium",
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
            paths: {
                select_error: "Error al seleccionar carpeta",
                title: "Rutas"
            },
            load_error: "Error al cargar configuraciones",
            save_error: "Error al guardar configuraciones",
            profile_not_found: "¡Perfil activo no encontrado!",
            versions_load_error: "Error al cargar versiones del sistema",
            title: "Ajustes",
            description: "Configure preferencias e integraciones de la aplicación.",
            tools: "Herramientas",
            general: "General",
            recycle_device_views: "Reciclar Pantalla del Dispositivo",
            recycle_device_views_desc: "Reutilizar pestañas existentes al ejecutar pruebas en el mismo dispositivo",
            allow_actions_during_test: "Permitir Acciones Durante la Prueba",
            allow_actions_during_test_desc: "Permite que el Inspector, Mapeador y otras herramientas funcionen incluso con una prueba en ejecución. (Experimental)",
            language: "Idioma",
            appearance: {
                title: "Apariencia",
                theme: "Tema de la App",
                light: "Claro",
                dark: "Oscuro",
                primary_color: "Color Primario",
                sidebar_logo: "Logo de la Barra Lateral",
                logo_light: "Modo Claro",
                logo_dark: "Modo Oscuro",
                use_default: "Predeterminado (Texto)",
                logo_hint: "Recomendado: PNG, Altura 40px, Ancho Máx 200px",
                logo_set: "Logo establecido",
                no_logo: "Ningún logo",
                upload_logo: "Subir Logo",
                remove_logo: "Eliminar Logo"
            },
            tool_config: {
                appium_args: "Argumentos Appium",
                scrcpy_args: "Argumentos Scrcpy",
                robot_args: "Argumentos Robot Framework",
                maestro_args: "Argumentos Maestro",
                appium_java_args: "Argumentos Appium Java",
                app_packages: "Paquetes de Aplicaciones",
                add_package: "Añadir Paquete",
                add_package_placeholder: "Añadir paquete (Presione Enter)",
                ngrok_token: "Token de Autenticación Ngrok"
            },
            ai: {
                title: "Integración IA (Google Gemini)",
                key: "Clave API",
                model: "ID del Modelo",
                check_models: "Verificar modelos disponibles",
                loading_models: "Cargando modelos...",
                models_fetched: "Modelos obtenidos",
                models_found_desc: "{{count}} modelos encontrados. Verifique la lista.",
                no_models_found: "No se encontraron modelos Gemini para esta clave.",
                placeholder: "Ingrese su Clave API Gemini",
                help: "Obtenga su Clave API gratuita en"
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
                    java: "Java (JDK)",
                    maven: "Maven",
                    maestro: "Maestro",
                    scrcpy: "Scrcpy",
                    ngrok: "Ngrok (Tunnelling)"
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
            action: {
                open_file: "Abrir Archivo de Configuración"
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
        sidebar: {
            dashboard: "Dashboard QA",
            run: "Ejecutar",
            description_run: "Gestión de dispositivos y ejecución de automatización.",
            tests: "Pruebas",
            description_tests: "Historial de ejecuciones y análisis de resultados.",
            toolbox: "Herramientas",
            description_toolbox: "Herramientas cotidianas para depuración y pruebas manuales.",
            ai_assistant: "Asistente IA",
            settings: "Configuración",
            description_settings: "Configure las preferencias e integraciones de la aplicación.",
            about: "Acerca de",
            description_about: "Información sobre Robot Runner y sus creadores."
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
        },
        tests: {
            mode: {
                file: "Archivo de Prueba",
                folder: "Carpeta de Pruebas",
                project: "Proyecto",
                args: "Archivo de Args"
            },
            target: "Objetivo",
            no_selection: "Sin selección válida",
            run_all: "Ejecutar Todas",
            run_selected: "Ejecutar Seleccionada",
            tips: {
                appium_maven: "Seleccione la raíz del proyecto Maven (donde se encuentra pom.xml)."
            },
            status: {
                checking: "Verificando Appium...",
                starting: "Iniciando Appium...",
                launching: "Iniciando Pruebas...",
                redirecting: "Redirigiendo...",
                failed: "Fallo al iniciar",
                waiting_server: "Esperando al Servidor...",
                server_not_ready: "El servidor Appium no está listo"
            },
            alerts: {
                busy: "Los siguientes dispositivos están ocupados:\n{{devices}}\n\nEspere a que terminen.",
                server_not_ready: "El servidor Appium no está listo"
            },
            options: {
                dont_overwrite: "Guardar Logs"
            }
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
            load_error: "Error al cargar historial",
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
                last_30_days: "Últimos 30 días",
                os_version: "Versión del SO"
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
        toolbox: {
            screenshot: {
                error: "Error al capturar pantalla"
            },
            recording: {
                start_error: "Error al iniciar grabación",
                stop_error: "Error al detener grabación"
            },
            scrcpy: {
                open_error: "Error al abrir Scrcpy"
            },
            rerun: {
                init_error: "Error al iniciar reejecución"
            },
            tabs: {
                console: "Consola de Prueba",
                logcat: "Logcat",
                commands: "Comandos",
                mirror: "Espejo",
                performance: "Rendimiento",
                apps: "Apps"
            },
            actions: {
                screenshot: "Capturar Pantalla",
                start_recording: "Grabar Pantalla",
                stop_recording: "Detener Grabación",
                stop_execution: "Detener Ejecución",
                rerun: "Re-ejecutar",
                switch_to_grid: "Cambiar a Cuadrícula",
                switch_to_tabs: "Cambiar a Pestañas",
                force_stop: "Forzar Detención"
            }
        },
        updater: {
            version_check_error: "Error al obtener versión de la aplicación",
            check_error: "Error al buscar actualizaciones"
        },
        onboarding: {
            title: "¡Bienvenido a Robot Runner!",
            description: "Vamos a configurar tu perfil para optimizar tu experiencia. Solo tomará un momento.",
            step1_title: "Selecciona tu Idioma",
            step2_title: "Elige tu Modo de Uso",
            error_no_mode: "Por favor, selecciona un modo de uso para continuar.",
            mode: {
                explorer: {
                    title: "Explorador",
                    description: "Herramientas cotidianas para depuración y pruebas manuales (ADB, Scrcpy, etc.). Sin configuración."
                },
                automator: {
                    title: "Automator",
                    description: "Desarrolle y ejecute pruebas automatizadas utilizando Robot Framework, Appium o Maestro."
                }
            },
            step3_title: "Seleccione su Framework",
            error_no_framework: "Por favor, seleccione un framework para continuar.",
            framework: {
                robot: {
                    title: "Robot Framework",
                    description: "Framework basado en Python. Ideal para automatización web/móvil de alto nivel."
                },
                appium: {
                    title: "Appium (Java)",
                    description: "Proyecto Java/Maven estándar. Ideal para automatización nativa especializada."
                },
                maestro: {
                    title: "Maestro",
                    description: "Flujos basados en YAML. Ideal para pruebas de UI ultra rápidas y simplicidad."
                }
            }
        }
    }
};
