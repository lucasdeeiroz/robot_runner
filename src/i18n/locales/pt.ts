export const pt = {
    translation: {
        sidebar: {
            run: "Executar",
            description_run: "Gerenciamento de dispositivos e execução de automação.",
            tests: "Testes",
            description_tests: "Histórico de execuções e análise de resultados.",
            ai_assistant: "Assistente IA",
            settings: "Configurações",
            description_settings: "Configure preferências e integrações do aplicativo.",
            about: "Sobre",
            description_about: "Informações sobre o Robot Runner e seus criadores."
        },
        run_tab: {
            launcher: "Iniciador",
            connect: "Conectar",
            inspector: "Inspetor",
            commands: "Comandos",
            device: {
                no_device: "Nenhum Dispositivo",
                selected_count: "{{count}} Selecionados",
                select: "Selecionar Dispositivos",
                busy: "Ocupado",
                refresh: "Atualizar"
            }
        },
        common: {
            cancel: "Cancelar",
            save: "Salvar",
            error_occurred: "Ocorreu um erro: {{error}}",
            delete: "Excluir",
            edit: "Editar",
            ok: "OK",
            search: "Buscar...",
            loading: "Carregando...",
            minimize: "Minimizar",
            close: "Fechar"
        },
        tests: {
            mode: {
                file: "Arquivo de Teste",
                folder: "Pasta de Testes",
                args: "Arquivo de Args"
            },
            target: "Alvo",
            no_selection: "Nenhuma seleção válida",
            run_all: "Executar Todos",
            run_selected: "Executar Selecionado",
            status: {
                checking: "Verificando Appium...",
                starting: "Iniciando Appium...",
                launching: "Iniciando Testes...",
                redirecting: "Redirecionando...",
                failed: "Falha ao iniciar"
            },
            alerts: {
                busy: "Os seguintes dispositivos estão ocupados:\n{{devices}}\n\nAguarde o término."
            },
            options: {
                dont_overwrite: "Não sobrescrever logs"
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
                pair: "Parear",
                disconnect: "Desconectar",
                start_tunnel: "Iniciar Túnel Público",
                stop_tunnel: "Parar Túnel",
                copy: "Copiado!",
                paste_url: "Colar URL"
            },
            status: {
                tunnel_active: "Túnel Ativo",
                starting_ngrok: "Iniciando Túnel Ngrok...",
                pasted: "Colado da área de transferência",
                clipboard_invalid: "Formato inválido na área de transferência",
                clipboard_error: "Permissão da área de transferência negada",
                auto_ip: "IP Auto-detectado: {{ip}}",
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
                tunnel_start_error: "Erro ao iniciar Ngrok"
            }
        },
        inspector: {
            empty: "Selecione um dispositivo para iniciar o Inspetor",
            refresh: "Atualizar Fonte",
            modes: {
                inspect: "Modo Inspeção",
                tap: "Modo Toque",
                swipe: "Modo Deslize"
            },
            status: {
                fetching: "Buscando estado...",
                ready: "Pronto",
                loading: "Carregando...",
                no_screenshot: "Sem captura de tela"
            },
            properties: "Propriedades do Nó",
            select_element: "Selecione um elemento na tela",
            attributes: {
                all: "Todos Atributos",
                xpath: "XPath",
                resource_id: "Resource ID",
                access_id: "Access ID",
                class: "Classe",
                identifiers: "Identificadores"
            },
            nav: {
                home: "Início",
                back: "Voltar",
                recents: "Recentes"
            }
        },
        commands: {
            empty: "Selecione um dispositivo para executar comandos",
            placeholder: "Digite comando ADB (ex: 'shell ls -la')",
            waiting: "Aguardando comandos...",
            clear: "Limpar Console",
            quick: "Rápido",
            saved: "Salvos",
            actions: {
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
        settings: {
            title: "Configurações",
            description: "Configure preferências e integrações do aplicativo.",
            paths: "Caminhos",
            tools: "Ferramentas",
            general: "Geral",
            language: "Idioma",
            appearance: {
                title: "Aparência",
                theme: "Tema do App",
                light: "Claro",
                dark: "Escuro",
                primary_color: "Cor Primária",
                sidebar_logo: "Logo da Barra Lateral",
                logo_light: "Logo Modo Claro",
                logo_dark: "Logo Modo Escuro",
                use_default: "Padrão (Texto)",
                logo_hint: "Recomendado: PNG, Altura 40px, Largura Máx 200px"
            },
            appium: {
                title: "Servidor Appium",
                running: "Rodando (PID: {{pid}})",
                stopped: "Parado",
                start: "Iniciar Servidor",
                stop: "Parar Servidor",
                logs: "Ver Logs",
                waiting: "Aguardando logs...",
                host: "Host",
                port: "Porta"
            },
            tool_config: {
                appium_args: "Argumentos Appium",
                scrcpy_args: "Argumentos Scrcpy",
                robot_args: "Argumentos Robot Framework",
                app_packages: "Pacotes de Apps",
                add_package: "Adicionar Pacote",
                add_package_placeholder: "Adicionar pacote (Pressione Enter)",
                ngrok_token: "Token Autenticação Ngrok"
            },
            ai: {
                title: "Integração IA (Google Gemini)",
                key: "Chave API",
                placeholder: "Digite sua Chave API Gemini"
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
                    scrcpy: "Scrcpy",
                    ngrok: "Ngrok (Túneis)"
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
        toolbox: {
            tabs: {
                console: "Console de Teste",
                logcat: "Logcat",
                commands: "Comandos",
                mirror: "Espelhamento",
                performance: "Performance"
            },
            actions: {
                screenshot: "Capturar Tela",
                start_recording: "Gravar Tela",
                stop_recording: "Parar Gravação",
                stop_execution: "Parar Execução",
                rerun: "Re-executar",
                switch_to_grid: "Alternar para Grade",
                switch_to_tabs: "Alternar para Abas"
            }
        },
        file_explorer: {
            up: "Subir Nível",
            loading: "Carregando...",
            error: "Falha ao carregar diretório",
            reset: "Resetar para Raiz",
            empty: "Diretório vazio",
            current: "Diretório atual",
            no_selection: "Nenhuma seleção",
            cancel: "Cancelar",
            select_file: "Selecionar Arquivo",
            select_folder: "Selecionar Pasta",
            select_generic: "Selecionar"
        },
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
            checking: "Verificando..."
        },
        ai_page: {
            title: "Assistente IA",
            powered_by: "Desenvolvido com Google Gemini",
            welcome: "Olá! Sou seu assistente de Robot Framework, acessível via Google Gemini. Como posso ajudar a escrever ou depurar seus testes hoje?",
            placeholder: "Pergunte sobre Robot Framework ou seus resultados...",
            thinking: "Pensando...",
            error: "Desculpe, encontrei um erro ao conectar ao serviço de IA."
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
        console: {
            waiting: "Aguardando saída..."
        },
        logcat: {
            start: "Iniciar",
            stop: "Parar",
            filter: "Filtrar App",
            entire_system: "Sistema Inteiro",
            no_packages: "Nenhum pacote configurado",
            level: "Nível de Log",
            clear: "Limpar Logs",
            lines: "linhas",
            no_logs: "Nenhum log capturado",
            select_device: "Selecione um dispositivo para ver logs",
            saving: "Salvando logs em:",
            errors: {
                app_not_running: "O aplicativo não está rodando: {{pkg}}"
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
        performance: {
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
            record_error: "Falha ao gravar",
            select_device: "Selecione um dispositivo para ver estatísticas de desempenho.",
            system_only: "Sistema Inteiro",
            device_stats: "Desempenho do Dispositivo",
            app_stats: "Desempenho do Aplicativo",
            auto: "Auto"
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
            }
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
        }
    }
};
