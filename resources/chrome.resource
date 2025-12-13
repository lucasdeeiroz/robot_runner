*** Settings ***
Documentation       Arquivo principal do projeto contendo as capabilities utilizadas no Appium

Library             AppiumLibrary


*** Variables ***
${URL_APLICACAO}                            https://www.exemplo.com/configuracoes # URL da página de configurações (substituir pela URL real)
${BROWSER}                                  chrome    # Navegador a ser utilizado (e.g., chrome, firefox, edge)

# Locators específicos do aplicativo (substituir pelos locators reais da sua aplicação)
${LOCATOR_TITULO_PAGINA_CONFIGURACOES}      id=settingsPageTitle    # Título da página de configurações
${LOCATOR_DROPDOWN_MECANISMO_PESQUISA}      id=searchEngineDropdown # Dropdown para selecionar o mecanismo de pesquisa
${LOCATOR_BOTAO_SALVAR_CONFIGURACOES}       id=saveSettingsButton    # Botão para salvar as configurações
${LOCATOR_MENSAGEM_SUCESSO}                 css=.toast-success    # Mensagem de sucesso após salvar (exemplo: um toast)
${versao_OS}                                ${EMPTY}
${udid}                                     ${EMPTY}
${deviceName}                               ${EMPTY}


*** Keywords ***
Abrir Aplicativo
    [Documentation]    Abre o aplicativo diretamente.
    Activate Application    app_id=com.chrome.beta
    Capture Page Screenshot
    Sleep    10s

Encerrar Teste
    [Documentation]    Encerra a sessão do Appium.
    Run Keyword And Ignore Error
    ...    Close All Applications

Fechar Aplicativo
    [Documentation]    Fecha o aplicativo diretamente.
    # Run Keyword And Ignore Error
    # ...    Terminate Application    app_id=com.android.chrome
    Sleep    10s
    Terminate Application    app_id=com.chrome.beta
    Capture Page Screenshot

Instalar App No Celular
    [Documentation]    Inicia a sessão do Appium e instala o app através do ADB.
    [Arguments]    ${noReset}=${True}
    Open Application    http://localhost:4723
    ...    automationName=UiAutomator2
    ...    udid=${udid}
    ...    platformName=Android
    ...    platformVersion=${versao_OS}
    ...    deviceName=${deviceName}
    # ...    app=C:\\apk\\PSEG\\app.apk
    ...    uiautomator2ServerInstallTimeout=60000
    ...    autoAcceptAlerts=${True}
    ...    autoLaunch=${False}
    ...    autoDismissAlerts=${True}
    ...    noReset=${noReset}
    Capture Page Screenshot

# Acessar Página de Configurações
#    [Documentation]    Abre o navegador, navega até a URL das configurações e verifica o carregamento da página.
#    Configurar Navegador    ${BROWSER}    # Pode adicionar 'headless=True' para rodar em segundo plano
#    Abrir Navegador    ${URL_APLICACAO}    ${BROWSER}
#    Maximizar Janela do Navegador
#    Esperar Até O Elemento Estar Visível    ${LOCATOR_TITULO_PAGINA_CONFIGURACOES}    Página de configurações não carregou ou o título não está visível.

# Selecionar Mecanismo De Pesquisa
#    [Arguments]    ${nome_mecanismo}
#    [Documentation]    Seleciona um mecanismo de pesquisa na lista suspensa e confirma o salvamento.
#    Esperar Até O Elemento Estar Visível    ${LOCATOR_DROPDOWN_MECANISMO_PESQUISA}    Dropdown de mecanismo de pesquisa não está visível ou não foi encontrado.
#    # Seleciona a opção pelo seu texto visível no dropdown
#    Selecionar Opção Por Rótulo    ${LOCATOR_DROPDOWN_MECANISMO_PESQUISA}    ${nome_mecanismo}

#    # Clica no botão "Salvar" para aplicar a mudança
#    Esperar Até O Elemento Estar Clicável    ${LOCATOR_BOTAO_SALVAR_CONFIGURACOES}    Botão "Salvar Configurações" não está clicável.
#    Clicar Elemento    ${LOCATOR_BOTAO_SALVAR_CONFIGURACOES}

#    # Verifica se uma mensagem de sucesso aparece, indicando que a configuração foi salva
#    Esperar Até O Elemento Estar Visível    ${LOCATOR_MENSAGEM_SUCESSO}    timeout=5s    Mensagem de sucesso não apareceu após salvar as configurações.

# Verificar Mecanismo De Pesquisa Atual
#    [Arguments]    ${mecanismo_esperado}
#    [Documentation]    Verifica se o mecanismo de pesquisa selecionado ou exibido corresponde ao esperado.
#    # Verifica o valor selecionado no próprio dropdown após a atualização
#    Elemento Deve Conter    ${LOCATOR_DROPDOWN_MECANISMO_PESQUISA}    ${mecanismo_esperado}

#    # Se houver um elemento separado que exibe o mecanismo atual (ex: um span com o nome), você poderia verificar também:
#    # Elemento Deve Conter    id=currentSearchEngineDisplay    ${mecanismo_esperado}

#    Fechar Navegador
