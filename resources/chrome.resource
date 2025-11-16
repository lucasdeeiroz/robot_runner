*** Settings ***
Documentation       Arquivo principal do projeto contendo as capabilities utilizadas no Appium

Library           AppiumLibrary


*** Variables ***
${versao_OS}    ${EMPTY}
${udid}         ${EMPTY}
${deviceName}   ${EMPTY}


*** Keywords ***
Abrir Aplicativo
    [Documentation]    Abre o aplicativo diretamente.
    Activate Application    app_id=com.chrome.beta
    Capture Page Screenshot

Encerrar Teste
    [Documentation]    Encerra a sessão do Appium.
    Run Keyword And Ignore Error
    ...                     Close All Applications

Fechar Aplicativo
    [Documentation]    Fecha o aplicativo diretamente.
    # Run Keyword And Ignore Error
    # ...    Terminate Application    app_id=com.android.chrome
    Terminate Application                 app_id=com.chrome.beta
    Capture Page Screenshot

Instalar App No Celular
    [Documentation]    Inicia a sessão do Appium e instala o app através do ADB.
    [Arguments]             ${noReset}=${True}
    Open Application        http://localhost:4723/wd/hub
    ...                     automationName=UiAutomator2
    ...                     udid=${udid}
    ...                     platformName=Android
    ...                     platformVersion=${versao_OS}
    ...                     deviceName=${deviceName}
    # ...                     app=C:\\apk\\PSEG\\app.apk
    ...                     uiautomator2ServerInstallTimeout=60000
    ...                     autoAcceptAlerts=${True}
    ...                     autoLaunch=${False}
    ...                     autoDismissAlerts=${True}
    ...                     noReset=${noReset}
    Capture Page Screenshot