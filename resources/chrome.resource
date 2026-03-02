*** Settings ***
Documentation       Arquivo principal do projeto contendo as capabilities utilizadas no Appium

Library             AppiumLibrary


*** Variables ***
${APP_URL}                                  https://www.google.com
${BROWSER}                                  chrome

${SETTINGS_PAGE_TITLE_LOCATOR}              id=settingsPageTitle
${SEARCH_MECHANISM_DROPDOWN_LOCATOR}        id=searchEngineDropdown
${SETTINGS_SAVE_BUTTON_LOCATOR}             id=saveSettingsButton
${SUCCESS_MESSAGE_LOCATOR}                  css=.toast-success
${OS_VERSION}                               ${EMPTY}
${UDID}                                     ${EMPTY}
${DEVICE_NAME}                              ${EMPTY}


*** Keywords ***
Open The Chrome App
    [Documentation]    Open the Chrome App.
    Activate Application    app_id=com.chrome.beta
    Capture Page Screenshot
    Sleep    10s

End The Test
    [Documentation]    Close the Chrome App.
    Run Keyword And Ignore Error
    ...    Close All Applications

Close The Chrome App
    [Documentation]    Close the Chrome App.
    # Run Keyword And Ignore Error
    # ...    Terminate Application    app_id=com.android.chrome
    Sleep    10s
    Terminate Application    app_id=com.chrome.beta
    Capture Page Screenshot

Install The Chrome App
    [Documentation]    Install the Chrome App.
    [Arguments]    ${noReset}=${True}
    Open Application    http://localhost:4723
    ...    automationName=UiAutomator2
    ...    udid=${UDID}
    ...    platformName=Android
    ...    platformVersion=${OS_VERSION}
    ...    deviceName=${DEVICE_NAME}
    ...    uiautomator2ServerInstallTimeout=60000
    ...    autoAcceptAlerts=${True}
    ...    autoLaunch=${False}
    ...    autoDismissAlerts=${True}
    ...    noReset=${noReset}
    Capture Page Screenshot

