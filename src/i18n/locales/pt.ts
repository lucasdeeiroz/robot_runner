export const pt = {
    translation: {
        about: {
            description: "Informações sobre o Robot Runner e seus criadores.",
            long_description: "Uma interface gráfica moderna e multiplataforma para Robot Framework e Appium, projetada para simplificar fluxos de automação de testes.",
            developed_by: "Desenvolvido por",
            lead: "Desenvolvedor Principal",
            collaborator: "Desenvolvedora Colaboradora",
            powered_by: "Desenvolvido com",
            tools_title: "Ferramentas Utilizadas",
            tools_desc: "O Robot Runner é construído sobre gigantes de código aberto:",
            tools_list: {
                tauri: { name: "Tauri", desc: "Framework leve para construção de aplicativos desktop seguros usando tecnologias web." },
                react: { name: "React", desc: "Biblioteca JavaScript para criar interfaces de usuário dinâmicas e responsivas." },
                rust: { name: "Rust", desc: "Linguagem de sistemas que oferece performance crítica e segurança de memória para o backend." },
                vite: { name: "Vite", desc: "Ferramenta de build de próxima geração que proporciona um ambiente de desenvolvimento ultrarrápido." },
                appium: { name: "Appium", desc: "Plataforma de automação líder para testes nativos, híbridos e web móveis." },
                robot: { name: "Robot Framework", desc: "Framework de automação genérico e keywords-driven para testes de aceitação." },
                maestro: { name: "Maestro", desc: "O framework de testes de UI mais simples e eficaz para automação móvel." },
                maven: { name: "Maven", desc: "Ferramenta confiável de automação de builds usada principalmente para projetos Java." },
                tailwind: { name: "TailwindCSS", desc: "Framework CSS utilitário para estilização rápida e consistente." },
                lucide: { name: "Lucide", desc: "Biblioteca de ícones vetoriais bonita e consistente." }
            },
            legal_title: "Termos e Licença",
            license: "Licença MIT",
            license_desc: "A permissão é concedida, gratuitamente, a qualquer pessoa que obtenha uma cópia deste software e dos arquivos de documentação associados (o 'Software'), para lidar com o Software sem restrições, incluindo, sem limitação, os direitos de usar, copiar, modificar, mesclar, publicar, distribuir, sublicenciar e/ou vender cópias do Software, e permitir que as pessoas a quem o Software é fornecido o façam, sujeito às seguintes condições: O aviso de direitos autorais acima e este aviso de permissão devem ser incluídos em todas as cópias ou partes substanciais do Software.",
            disclaimer: "O software é fornecido 'como está', sem garantia de qualquer tipo, expressa ou implícita.",
            update_check: "Verificar Atualizações",
            update_available: "Nova versão disponível: {{version}}",
            update_not_available: "Você está atualizado",
            update_error: "Falha ao verificar atualizações",
            checking: "Verificando...",
            update_badge: "ATUALIZAÇÃO"
        },
        ai_page: {
            title: "Assistente IA",
            powered_by: "Desenvolvido com Google Gemini",
            welcome: "Olá! Sou seu assistente de Robot Framework, acessível via Google Gemini. Como posso ajudar a escrever ou depurar seus testes hoje?",
            placeholder: "Pergunte sobre Robot Framework ou seus resultados...",
            thinking: "Pensando...",
            error: "Desculpe, encontrei um erro ao conectar ao serviço de IA."
        },
        apps: {
            fetch_error: "Falha ao buscar pacotes",
            install_error: "Falha ao instalar APK",
            actions: {
                uninstall_title: "Desinstalar Pacote",
                uninstall_confirm: "Tem certeza que deseja desinstalar {{pkg}}?",
                disable_title: "Desativar App",
                enable_title: "Ativar App",
                disable_confirm: "Desativar {{pkg}}?",
                enable_confirm: "Ativar {{pkg}}?",
                clear_title: "Limpar Dados",
                clear_confirm: "Limpar todos os dados de {{pkg}}?",
                install: "Instalar APK",
                uninstall: "Desinstalar",
                disable: "Desativar",
                enable: "Ativar",
                clear: "Limpar Dados",
                sort_by_name: "Ordenar por Nome",
                sort_by_package: "Ordenar por Pacote",
                refresh: "Atualizar Lista"
            },
            search_placeholder: "Buscar pacotes...",
            toggle_system: "Exibir Apps do Sistema",
            no_device: "Nenhum dispositivo selecionado",
            no_packages: "Nenhum pacote encontrado",
            status: {
                installing: "Instalando APK...",
                disabled_badge: "Desativado",
                paused_test: "Atualização pausada durante o teste"
            },
            success: {
                uninstalled: "Pacote {{pkg}} desinstalado com sucesso",
                disabled: "Pacote {{pkg}} desativado",
                enabled: "Pacote {{pkg}} ativado",
                cleared: "Dados de {{pkg}} limpos",
                installed: "APK instalado com sucesso"
            },
            error: {
                install_failed: "Falha na instalação: {{error}}"
            }
        },
        commands: {
            title: "Comandos ADB",
            parse_error: "Falha ao processar comandos salvos",
            cancel_error: "Falha ao cancelar comando",
            empty: "Selecione um dispositivo para executar comandos",
            input_placeholder: "Digite comando ADB (ex: 'shell ls -la')",
            waiting: "Aguardando comandos...",
            status: {
                test_running: "Execução de teste em andamento"
            },
            clear: "Limpar Console",
            quick: "Rápido",
            saved: "Salvos",
            actions: {
                ip_address: "Endereço IP",
                list_packages: "Listar Pacotes",
                battery: "Bateria",
                reboot: "Reiniciar",
                save: "Salvar",
                send: "Enviar",
                delete_confirm: "Excluir este comando salvo?"
            },
            modal: {
                title: "Salvar Comando Personalizado",
                label: "Rótulo",
                placeholder: "ex: Listar Arquivos",
                command: "Comando",
                cancel: "Cancelar",
                save: "Salvar Comando"
            }
        },
        common: {
            cancel: "Cancelar",
            save: "Salvar",
            saved: "Salvo",
            undo: "Desfazer",
            redo: "Refazer",
            next: "Próximo",
            back: "Voltar",
            finish: "Concluir",
            collapse: "Colapsar",
            expand: "Expandir",
            copy: "Copiar",
            copied: "Copiado!",
            download: "Baixar",
            downloading: "Baixando...",
            clear: "Limpar",
            coming_soon: "Módulo {{module}} em breve...",
            error_occurred: "Ocorreu um erro: {{error}}",
            delete: "Excluir",
            edit: "Editar",
            ok: "OK",
            search: "Buscar...",
            loading: "Carregando...",
            minimize: "Minimizar",
            maximize: "Maximizar",
            close: "Fechar",
            confirm: "Confirmar",
            attention: "Atenção",
            errors: {
                open_file_failed: "Falha ao abrir arquivo ou pasta",
                open_link_failed: "Falha ao abrir link"
            }
        },
        components: {
            logo: {
                load_error: "Falha ao carregar logo"
            }
        },
        connect: {
            wireless: {
                title: "Conexão Sem Fio",
                desc: "Conectar via Wi-Fi ADB"
            },
            remote: {
                title: "Acesso Remoto (Ngrok)",
                desc: "Expor Dispositivo ADB na internet"
            },
            labels: {
                ip: "Endereço IP",
                port: "Porta",
                code: "Código de Pareamento (Opcional)",
                config: "Configuração",
                expose_port: "Porta Exposta",
                token: "Token",
                missing_token: "Ausente (Verifique Config)"
            },
            actions: {
                connect: "Conectar",
                copy: "Copiado!",
                disconnect: "Desconectar",
                disconnect_all: "Desconectar Todos",
                enable_remote: "Habilitar Conexão Remota",
                enable_tcpip: "Habilitar 5555",
                enable_tcpip_tooltip: "Executar 'adb tcpip 5555'",
                pair: "Parear",
                paste_url: "Colar URL",
                rerun_failed: "Reexecutar Falhas",
                start_tunnel: "Iniciar Túnel Público",
                stop_tunnel: "Parar Túnel"
            },
            status: {
                tunnel_active: "Túnel Ativo",
                starting_ngrok: "Iniciando Túnel Ngrok...",
                pasted: "Colado da área de transferência",
                clipboard_invalid: "Formato inválido na área de transferência",
                clipboard_error: "Permissão da área de transferência negada",
                auto_ip: "IP Auto-detectado",
                ip_not_found: "Não foi possível detectar o IP via ADB",
                select_device_first: "Selecione um dispositivo para expor",
                forwarding: "Encaminhando para localhost:5555 (ADB)",
                executing_connect: "Conectando...",
                executing_pair: "Emparelhando...",
                executing_disconnect: "Desconectando...",
                connection_failed: "Falha na conexão",
                pairing_failed: "Falha no emparelhamento",
                connection_success: "Conectado a {{target}}",
                pairing_success: "Emparelhado com sucesso com {{target}}",
                disconnection_success: "Desconectado de {{target}}",
                disconnected_all: "Todos os dispositivos desconectados",
                tunnel_stopped: "Túnel Ngrok Parado",
                tunnel_stop_error: "Erro ao parar Ngrok",
                tunnel_start_error: "Erro ao iniciar Ngrok",
                payment_required_title: "Pagamento Ngrok Necessário",
                payment_required_desc: "Contas gratuitas do ngrok exigem um cartão de crédito válido para usar túneis TCP. Você não será cobrado.",
                add_card: "Adicionar Cartão",
                cancel_card: "Cancelar",
                enabling_tcpip: "Habilitando TCP/IP 5555...",
                tcpip_enabled: "TCP/IP 5555 Habilitado",
                tcpip_failed: "Falha ao habilitar TCP/IP"
            },
            security_warning: {
                title: "Aviso de Segurança",
                message: "Habilitar a conexão remota (Ngrok) exporá seu dispositivo local à internet.\n\nCertifique-se de que isso esteja em conformidade com as políticas de Segurança da Informação da sua organização antes de prosseguir.",
                cancel: "Cancelar",
                confirm: "Habilitar Ngrok"
            }
        },
        console: {
            waiting: "Aguardando saída..."
        },
        dashboard: {
            title: "Painel QA",
            description: "Ferramentas auxiliares para QA: Geração de cenários, edição de imagens e documentação.",
            editor: {
                title: "Conteúdo Gerado",
                scenario_input: "Requisitos e Contexto"
            },
            tabs: {
                scenarios: "Gerador IA",
                images: "Editor de Imagens",
                history: "Histórico",
                mapper: "Mapeador"
            },
            history: {
                title: "Histórico de Arquivos",
                empty: "Nenhum arquivo gerado."
            },
            image: {
                title: "Editor de Imagens",
                new: "Nova Imagem / Colar",
                open: "Abrir Imagem",
                opened: "Imagem Carregada!",
                copy: "Copiar Imagem",
                pasted: "Imagem colada!",
                no_clipboard: "Nenhuma imagem na área de transferência.",
                copied: "Copiado para área de transferência!",
                tools: {
                    cursor: "Cursor",
                    arrow: "Seta",
                    rect: "Retângulo",
                    crop: "Área de Corte"
                }
            },
            generator: {
                title: "Gerador de Artefatos IA",
                input_label: "Requisitos / Critérios de Aceite",
                input_placeholder: "Cole seus requisitos, user story ou descrição de bug aqui...",
                use_mapping: "Usar Mapeamento do App",
                use_mapping_hint: "Incluir elementos de tela no contexto da IA para geração mais precisa",
                type_label: "Tipo de Geração",
                generate_button: "Gerar com IA",
                generating: "Gerando...",
                key_required: "Chave API do Gemini necessária. Configure em Definições.",
                types: {
                    test_case: "Casos de Teste (BDD)",
                    pbi: "Item de Backlog (PBI)",
                    improvement: "Melhoria Funcional",
                    bug: "Relatório de Bug"
                },
                empty_state: "O conteúdo gerado aparecerá aqui...",
                success: "Artefato gerado com sucesso usando {{method}}"
            },
            actions: {
                generate: "Gerar Cenários",
                generated_success: "CASOS DE TESTE GERADOS COM SUCESSO (via {{method}})",
                gemini_failed: "Falha na geração via Gemini: {{error}}",
                using_local_generator: "Usando gerador local. {{message}}",
                export_xlsx: "Excel (.xlsx)",
                export_docx: "Word (.docx)"
            },
            export: {
                success: "Exportado com sucesso!",
                error: "Erro ao exportar"
            }
        },
        devices: {
            load_error: "Falha ao carregar dispositivos"
        },
        feedback: {
            success: "Sucesso",
            error: "Erro",
            saved: "Salvo com sucesso",
            test_started: "Execução de Teste Iniciada",
            test_finished: "Execução de Teste Finalizada",
            test_passed: "Suíte de Teste Aprovada",
            test_failed: "Suíte de Teste Falhou",
            appium_started: "Servidor Appium Iniciado",
            appium_stopped: "Servidor Appium Parado",
            adb_connected: "ADB Sem Fio Conectado",
            remote_connected: "Acesso Remoto Conectado",
            recording_saved: "Gravação de Tela Salva",
            recording_started: "Gravação Iniciada",
            inspector_updated: "Inspetor Atualizado",
            logcat_saved: "Logcat Salvo",
            performance_saved: "Estatísticas de Desempenho Salvas",
            mirror_launched: "Espelhamento Iniciado",
            screenshot_saved: "Captura de Tela Salva",
            profile_changed: "Perfil de Configuração Alterado",
            details: {
                device: "Dispositivo: {{device}}",
                path: "Caminho: {{path}}",
                url: "URL: {{url}}"
            },
            saved_to_prefix: "Arquivo salvo em:"
        },
        file_explorer: {
            list_error: "Falha ao listar diretório",
            error: "Erro ao acessar diretório",
            up: "Subir Nível",
            loading: "Carregando...",
            reset: "Resetar para Raiz",
            empty: "Diretório vazio",
            current: "Diretório atual",
            no_selection: "Nenhuma seleção",
            cancel: "Cancelar",
            select_file: "Selecionar Arquivo",
            select_folder: "Selecionar Pasta",
            select_generic: "Selecionar"
        },
        inspector: {
            title: "Inspetor",
            update_error: "Falha ao atualizar inspetor",
            input_error: "Falha ao enviar input",
            empty: "Selecione um dispositivo para iniciar o Inspetor",
            refresh: "Atualizar Fonte",
            search: {
                placeholder: "Buscar por ID, XPath, etc...",
                clear: "Limpar busca"
            },
            modes: {
                inspect: "Modo Inspeção",
                tap: "Modo Toque",
                swipe: "Modo Deslize"
            },
            status: {
                fetching: "Buscando estado...",
                ready: "Pronto",
                loading: "Carregando...",
                no_screenshot: "Sem captura de tela",
                paused_test: "Inspector desabilitado durante o teste"
            },
            properties: "Propriedades do Nó",
            select_element: "Selecione um elemento na tela",
            nav: {
                home: "Início",
                back: "Voltar",
                recents: "Recentes"
            },
            modal: {
                edit_xpath: "Editar XPath",
                edit_selector: "Editar Seletor",
                match_type: "Tipo de Correspondência",
                match_type_equals: "Igual",
                match_type_contains: "Contém",
                match_type_starts_with: "Começa Com",
                match_type_ends_with: "Termina Com",
                match_type_regex: "Regex/Matches",
                preferred_attr: "Atributo Preferencial",
                preferred_attr_resource_id: "Resource ID",
                preferred_attr_text: "Texto",
                preferred_attr_content_desc: "Content Desc",
                preferred_attr_class: "Somente Classe",
                result: "Resultado",
                use_wrapper: "Usar wrapper new UiSelector()",
                additional_attrs: "Atributos Adicionais",
                attr_resource_id: "Resource ID",
                attr_text: "Texto",
                attr_content_desc: "Content Desc",
                attr_class: "Classe",
                attr_index: "Índice",
                attr_clickable: "Clicável",
                attr_enabled: "Habilitado",
                attr_checked: "Marcado",
                attr_selected: "Selecionado",
                attr_focusable: "Focável"
            },
            attributes: {
                copied: "Copiado!",
                all: "Todos Atributos",
                xpath: "XPath",
                resource_id: "Resource ID",
                access_id: "Accessibility ID",
                class: "Classe",
                identifiers: "Identificadores",
                hierarchy: "Hierarquia"
            }
        },
        logcat: {
            title: "Logcat",
            errors: {
                fetch_failed: "Falha ao buscar logcat",
                start_failed: "Falha ao iniciar logcat",
                stop_failed: "Falha ao parar logcat",
                app_not_running: "App não está rodando: {{pkg}}"
            },
            status: {
                paused_test: "Logcat pausado durante o teste",
                waiting: "Aguardando logs...",
                empty: "Nenhum log capturado"
            },
            saving: "Salvando logcat em",
            start: "Iniciar",
            stop: "Parar",
            filter: "Filtrar App",
            entire_system: "Sistema Inteiro",
            no_packages: "Nenhum pacote configurado",
            level: "Nível de Log",
            clear: "Limpar Logs",
            lines: "linhas",
            no_logs: "Nenhum log capturado",
            select_device: "Selecione um dispositivo para ver logs"
        },
        mapper: {
            title: "Mapeador",
            empty: "Selecione um dispositivo para iniciar o mapeamento",
            refresh: "Atualizar Fonte",
            flowchart: {
                open: "Abrir Fluxograma",
                export: "Exportar Fluxo",
                export_image: "Exportar Imagem",
                import: "Importar Fluxo",
                export_success: "Fluxo exportado com sucesso!",
                import_success: "Fluxo importado com sucesso!",
                export_error: "Erro ao exportar fluxo.",
                import_error: "Erro ao importar fluxo.",
                quick_connect: "Conexão Rápida",
                source_element: "Elemento de Origem",
                target_screen: "Tela de Destino",
                select_element: "Selecionar Elemento",
                select_target: "Selecionar Destino",
                connect: "Conectar",
                cancel: "Cancelar",
                no_elements: "Nenhum elemento mapeado disponível.",
                title: "Fluxo de Navegação",
                unsaved_changes: {
                    title: "Alterações não salvas",
                    message: "Você tem alterações não salvas. Deseja salvar antes de sair?",
                    save_and_exit: "Salvar e Sair",
                    exit_without_saving: "Sair sem Salvar",
                    cancel: "Cancelar"
                }
            },
            properties: "Propriedades do Elemento",
            clear_selection: "Limpar Seleção",
            section_title: "Mapeador de Tela",
            screen_mapper: "Mapeador de Tela",
            screen_settings: "Configurações da Tela",
            saved_screens: "Telas Salvas",
            saved_elements: "Elementos Salvos",
            no_saved_maps: "Nenhum mapa salvo encontrado",
            no_saved_elements: "Nenhum elemento mapeado",
            items: "itens",
            elements_mapped_count: "{{count}} elementos mapeados",
            elements_mapped: "elementos mapeados",
            select_element: "Selecione um elemento na captura de tela",
            types: {
                button: "Botão",
                input: "Entrada",
                text: "Texto",
                link: "Link",
                toggle: "Alternador",
                checkbox: "Caixa de Seleção",
                image: "Imagem",
                menu: "Menu",
                scroll_view: "Rolagem",
                tab: "Aba"
            },
            screen_name: "Nome da Tela",
            screen_type: "Tipo de Tela",
            screen_tags: "Tags",
            screen_types: {
                screen: "Tela",
                modal: "Modal",
                tab: "Aba",
                drawer: "Gaveta"
            },
            modes: {
                inspect: "Modo Inspeção",
                tap: "Modo Toque",
                swipe: "Modo Deslize"
            },
            status: {
                fetching: "Buscando estado do dispositivo...",
                ready: "Pronto",
                loading: "Carregando...",
                no_screenshot: "Sem captura de tela",
                paused_test: "Mapeador desativado durante o teste"
            },
            nav: {
                home: "Início",
                back: "Voltar",
                recents: "Recentes"
            },
            attributes: {
                copied: "Copiado!",
                xpath: "XPath",
                resource_id: "Resource ID",
                access_id: "Accessibility ID",
                identifiers: "Identificadores",
                hierarchy: "Hierarquia"
            },
            input: {
                element_type: "Tipo de Elemento",
                element_name: "Nome do Elemento",
                navigates_to: "Navega Para (Opcional)",
                menu_options: "Opções de Menu (Separadas por vírgula)",
                parent_screen: "Tela Pai",
                select_existing: "Selecionar Elemento Existente"
            },
            placeholder: {
                select_element: "Escolha um elemento para editar...",
                element_name: "ex: Botão de Login",
                navigates_to: "Nome da Tela",
                menu_options: "Opção 1, Opção 2...",
                parent_screen: "Nome da Tela Pai",
                screen_name: "Nome da Tela (Único)",
                screen_tags: "ex: Auth, Perfil"
            },
            action: {
                add: "Adicionar Elemento",
                update: "Atualizar Elemento",
                remove: "Remover Elemento",
                save_screen: "Salvar Tela",
                load: "Carregar",
                new: "Novo",
                discard: "Descartar",
                discard_desc: "Descartar Tela",
                delete: "Excluir"
            },
            feedback: {
                mapped: "Elemento mapeado!",
                updated: "Elemento Atualizado",
                removed: "Elemento removido",
                empty_map: "Nenhum elemento mapeado ainda",
                saved: "Tela mapeada com sucesso!",
                loaded: "Mapa de tela carregado",
                new_screen: "Pronto para nova tela",
                deleted: "Mapa excluído"
            },
            error: {
                missing_name: "Por favor, forneça um nome para o elemento",
                missing_screen_name: "Por favor, forneça um Nome para a Tela",
                save_failed: "Falha ao salvar mapa da tela"
            },
            confirm: {
                delete: "Tem certeza que deseja excluir este mapa?",
                delete_title: "Excluir Mapeamento de Tela?",
                delete_desc: "Tem certeza que deseja excluir este mapeamento? Esta ação não pode ser desfeita.",
                discard: "Descartar alterações atuais?"
            }
        },
        performance: {
            fetch_error: "Falha ao buscar estatísticas",
            save_error: "Falha ao salvar dados de performance",
            record_error: "Falha ao iniciar gravação",
            title: "Desempenho do Dispositivo",
            auto_on: "Auto-Atualizar Ligado",
            auto_off: "Auto-Atualizar Desligado",
            refresh: "Atualizar Agora",
            cpu: "Uso de CPU",
            ram: "Uso de RAM",
            battery: "Bateria",
            load: "carga",
            used: "usado",
            loading: "Carregando estatísticas...",
            error: "Falha ao buscar estatísticas do dispositivo",
            start_record: "Iniciar Gravação",
            stop_record: "Parar Gravação",
            recording: "Gravando...",
            select_device: "Selecione um dispositivo para ver estatísticas de desempenho.",
            system_only: "Sistema Inteiro",
            device_stats: "Desempenho do Dispositivo",
            app_stats: "Desempenho do Aplicativo",
            auto: "Auto",
            na: "N/D",
            status: {
                paused_test: "Monitoramento de performance pausado durante o teste"
            }
        },
        run_tab: {
            launcher: "Iniciador",
            connect: "Conectar",
            inspector: "Inspetor",
            commands: "Comandos",
            device: {
                no_device: "Nenhum Dispositivo",
                no_devices_found: "Nenhum dispositivo encontrado",
                selected_count: "{{count}} Selecionados",
                select: "Selecionar Dispositivos",
                busy: "Ocupado",
                refresh: "Atualizar Dispositivos",
                open_toolbox: "Abrir Caixa de Ferramentas"
            },
            console: {
                running: "EXECUTANDO",
                pass: "SUCESSO",
                fail: "FALHA",
                test_summary: "{{total}} TESTES: {{passed}} COM SUCESSO, {{failed}} COM FALHA",
                waiting: "Aguardando logs..."
            }
        },
        scrcpy: {
            title: "Espelhamento de Tela",
            description: "Inicie o Scrcpy para espelhar e controlar a tela deste dispositivo em uma janela separada.",
            start: "Iniciar Espelhamento",
            starting: "Iniciando...",
            note: "Nota: O Scrcpy deve estar instalado no PATH do sistema. A janela de espelho roda independentemente.",
            error: "Falha ao iniciar Scrcpy. Garanta que ele esteja instalado e no seu PATH."
        },
        session: {
            stop_error: "Falha ao parar sessão",
            rerun_error: "Falha ao reexecutar"
        },
        settings: {
            logo: {
                read_error: "Falha ao ler arquivo de logo. Tente novamente.",
                select_error: "Falha ao selecionar logo"
            },
            appium: {
                status_error: "Falha ao obter status do Appium",
                title: "Servidor Appium",
                running: "Rodando (PID: {{pid}})",
                stopped: "Parado",
                start: "Iniciar Servidor",
                stop: "Parar Servidor",
                logs: "Ver Logs",
                waiting: "Aguardando logs...",
                host: "Host",
                port: "Port"
            },
            paths: {
                select_error: "Falha ao selecionar pasta",
                title: "Caminhos"
            },
            load_error: "Falha ao carregar configurações",
            save_error: "Falha ao salvar configurações",
            profile_not_found: "Perfil ativo não encontrado!",
            versions_load_error: "Falha ao carregar versões do sistema",
            title: "Configurações",
            description: "Configure preferências e integrações do aplicativo.",
            tools: "Ferramentas",
            general: "Geral",
            recycle_device_views: "Reciclar Tela de Dispositivo",
            recycle_device_views_desc: "Reutilizar abas existentes ao executar testes no mesmo dispositivo",
            allow_actions_during_test: "Permitir Ações Durante o Teste",
            allow_actions_during_test_desc: "Permite que o Inspetor, Mapeador e outras ferramentas funcionem mesmo com um teste em execução. (Experimental)",
            language: "Idioma",
            appearance: {
                title: "Aparência",
                theme: "Tema do App",
                light: "Claro",
                dark: "Escuro",
                primary_color: "Cor Primária",
                sidebar_logo: "Logo da Barra Lateral",
                logo_light: "Modo Claro",
                logo_dark: "Modo Escuro",
                use_default: "Padrão (Texto)",
                logo_hint: "Recomendado: PNG, Altura 40px, Largura Máx 200px",
                logo_set: "Logo definida",
                no_logo: "Nenhuma logo",
                upload_logo: "Carregar Logo",
                remove_logo: "Remover Logo"
            },
            tool_config: {
                appium_args: "Argumentos Appium",
                scrcpy_args: "Argumentos Scrcpy",
                robot_args: "Argumentos Robot Framework",
                maestro_args: "Argumentos Maestro",
                appium_java_args: "Argumentos Appium Java",
                app_packages: "Pacotes de Apps",
                add_package: "Adicionar Pacote",
                add_package_placeholder: "Adicionar pacote (Pressione Enter)",
                ngrok_token: "Token Autenticação Ngrok"
            },
            ai: {
                title: "Integração IA (Google Gemini)",
                key: "Chave API",
                model: "ID do Modelo",
                check_models: "Verificar modelos disponíveis",
                loading_models: "Carregando modelos...",
                models_fetched: "Modelos obtidos",
                models_found_desc: "{{count}} modelos encontrados. Verifique a lista.",
                no_models_found: "Nenhum modelo Gemini encontrado para esta chave.",
                placeholder: "Digite sua Chave API Gemini",
                help: "Obtenha sua Chave API gratuita em"
            },
            system: {
                title: "Versões do Sistema",
                checking: "Verificando versões...",
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
            folder_select: "Selecionar Pasta",
            dir_label: "Diretório {{key}}",
            not_set: "Não definido",
            profiles: {
                title: "Perfis de Configuração",
                create: "Novo Perfil",
                rename: "Renomear Perfil",
                delete: "Excluir Perfil",
                name_placeholder: "Nome do Perfil",
                confirm_delete: "Tem certeza que deseja excluir este perfil? Isso não pode ser desfeito.",
                default: "Padrão"
            },
            action: {
                open_file: "Abrir Arquivo de Configurações"
            },
            path_labels: {
                suites: "Diretório de Suítes",
                tests: "Diretório de Testes",
                resources: "Diretório de Recursos",
                logs: "Diretório de Logs",
                logcat: "Diretório do Logcat",
                screenshots: "Diretório de Capturas de Tela",
                recordings: "Diretório de Gravações",
                automationRoot: "Raiz da Automação (Working Dir)"
            }
        },
        sidebar: {
            dashboard: "Dashboard QA",
            run: "Executar",
            description_run: "Gerenciamento de dispositivos e execução de automação.",
            tests: "Testes",
            description_tests: "Histórico de execuções e análise de resultados.",
            toolbox: "Ferramentas",
            description_toolbox: "Ferramentas cotidianas para debug e testes manuais.",
            ai_assistant: "Assistente IA",
            settings: "Configurações",
            description_settings: "Configure preferências e integrações do aplicativo.",
            about: "Sobre",
            description_about: "Informações sobre o Robot Runner e seus criadores."
        },
        startup: {
            loading: "Inicializando aplicação...",
            checking: "Verificando ferramentas do sistema...",
            critical: {
                title: "Ferramentas Críticas Ausentes",
                description: "As seguintes ferramentas são necessárias para executar esta aplicação:",
                action: "Sair da Aplicação"
            },
            testing: {
                title: "Ferramentas de Teste Ausentes",
                description: "Algumas ferramentas necessárias para automação estão faltando:",
                note: "Você ainda pode usar outros recursos, mas a execução de testes será desativada.",
                action: "Configurar"
            },
            mirroring: {
                title: "Ferramenta de Espelhamento Ausente",
                description: "O Scrcpy é necessário para o espelhamento de tela:",
                note: "O espelhamento de tela será desativado.",
                action: "Continuar"
            }
        },
        tests: {
            mode: {
                file: "Arquivo de Teste",
                folder: "Pasta de Testes",
                project: "Projeto",
                args: "Arquivo de Args"
            },
            target: "Alvo",
            no_selection: "Nenhuma seleção válida",
            run_all: "Executar Todos",
            run_selected: "Executar Selecionado",
            tips: {
                appium_maven: "Selecione a raiz do projeto Maven (onde está o pom.xml)."
            },
            status: {
                checking: "Verificando Appium...",
                starting: "Iniciando Appium...",
                launching: "Iniciando Testes...",
                redirecting: "Redirecionando...",
                failed: "Falha ao iniciar",
                waiting_server: "Aguardando Servidor...",
                server_not_ready: "O Servidor Appium não está pronto"
            },
            alerts: {
                busy: "Os seguintes dispositivos estão ocupados:\n{{devices}}\n\nAguarde o término.",
                server_not_ready: "O Servidor Appium não está pronto"
            },
            options: {
                dont_overwrite: "Salvar Logs"
            }
        },
        tests_page: {
            monitoring: "Monitoramento de Testes",
            toolbox: "Caixa de Ferramentas",
            history: "Histórico",
            loading: "Carregando histórico...",
            no_logs: "Nenhum log de execução encontrado.",
            report: "Relatório",
            open_folder: "Abrir Pasta",
            session_not_found: "Sessão não encontrada.",
            close_tab: "Fechar Aba",
            load_error: "Falha ao carregar histórico",
            filter: {
                search: "Buscar logs...",
                period: "Período",
                group_by: "Agrupar por",
                status: "Status",
                device: "Dispositivo",
                suite: "Suíte",
                all_time: "Todo o período",
                today: "Hoje",
                last_7_days: "Últimos 7 dias",
                last_30_days: "Últimos 30 dias",
                os_version: "Versão do SO"
            },
            actions: {
                refresh: "Atualizar Lista",
                clear: "Limpar",
                delete: "Excluir Log",
                open_launcher: "Abrir no Iniciador"
            },
            unknown_os: "SO Desconhecido",
            unknown_model: "Modelo Desconhecido",
            charts: {
                status_distribution: "Distribuição de Status",
                group_performance: "Desempenho por {{group}}",
                select_group: "Selecione uma opção de 'Agrupar por' para ver detalhes",
                show: "Mostrar Gráficos",
                hide: "Ocultar Gráficos"
            }
        },
        toolbox: {
            screenshot: {
                error: "Falha ao capturar tela"
            },
            recording: {
                start_error: "Falha ao iniciar gravação",
                stop_error: "Falha ao parar gravação"
            },
            scrcpy: {
                open_error: "Falha ao abrir Scrcpy"
            },
            rerun: {
                init_error: "Falha ao iniciar reexecução"
            },
            tabs: {
                console: "Console de Teste",
                logcat: "Logcat",
                commands: "Comandos",
                mirror: "Espelhamento",
                performance: "Performance",
                apps: "Apps"
            },
            actions: {
                screenshot: "Capturar Tela",
                start_recording: "Gravar Tela",
                stop_recording: "Parar Gravação",
                stop_execution: "Parar Execução",
                rerun: "Re-executar",
                switch_to_grid: "Alternar para Grade",
                switch_to_tabs: "Alternar para Abas",
                force_stop: "Forçar Parada"
            }
        },
        updater: {
            version_check_error: "Falha ao obter versão do app",
            check_error: "Falha ao verificar atualizações"
        },
        onboarding: {
            title: "Bem-vindo ao Robot Runner!",
            description: "Vamos configurar seu perfil para otimizar sua experiência. Isso levará apenas um momento.",
            step1_title: "Selecione seu Idioma",
            step2_title: "Escolha seu Modo de Uso",
            error_no_mode: "Por favor, selecione um modo de uso para continuar.",
            mode: {
                explorer: {
                    title: "Explorador",
                    description: "Ferramentas cotidianas para debug e testes manuais (ADB, Scrcpy, etc.). Nenhuma configuração necessária."
                },
                automator: {
                    title: "Automator",
                    description: "Desenvolva e execute testes automatizados usando Robot Framework, Appium ou Maestro."
                }
            },
            step3_title: "Selecione seu Framework",
            error_no_framework: "Por favor, selecione um framework para continuar.",
            framework: {
                robot: {
                    title: "Robot Framework",
                    description: "Framework baseado em Python. Ideal para automação web/mobile de alto nível."
                },
                appium: {
                    title: "Appium (Java)",
                    description: "Projeto Java/Maven padrão. Ideal para automação nativa especializada."
                },
                maestro: {
                    title: "Maestro",
                    description: "Fluxos baseados em YAML. Ideal para testes de UI ultra-rápidos e simplicidade."
                }
            }
        }
    }
};
