*** Settings ***
Documentation       Validação de fluxo de cadastro

Resource            ../resources/chrome.resource

Suite Setup         Instalar App No Celular
Suite Teardown      Encerrar Teste
Test Setup          Abrir Aplicativo
Test Teardown       Fechar Aplicativo


*** Test Cases ***
Validar Acesso Ao Chrome
    [Documentation]    Valida o acesso ao aplicativo Chrome.
    [Tags]    chrome
    Sleep    5s
    Capture Page Screenshot
    Log    Acesso ao Chrome validado com sucesso.

# Cenário: Trocar o Mecanismo de Pesquisa para Yahoo! Brasil
#     [Documentation]    Este teste verifica a funcionalidade de trocar o mecanismo de pesquisa padrão para "Yahoo! Brasil"
#     [Tags]             Configuracoes    Pesquisa    YahooBrasil    Automatizado
#     Acessar Página de Configurações
#     Selecionar Mecanismo De Pesquisa    Yahoo! Brasil
#     Verificar Mecanismo De Pesquisa Atual    Yahoo! Brasil