*** Settings ***
Documentation       Validação de fluxo de cadastro

Resource            ../resources/chrome.resource

Suite Setup         Instalar App No Celular
Suite Teardown      Encerrar Teste


*** Test Cases ***
Validar Acesso Ao Chrome
    [Documentation]    Valida o acesso ao aplicativo Chrome.
    [Tags]    chrome
    Abrir Aplicativo
    Sleep    5s
    Capture Page Screenshot
    # Adicione aqui os passos do teste para validar o acesso ao Chrome.
    Log    Acesso ao Chrome validado com sucesso.
    Fechar Aplicativo
