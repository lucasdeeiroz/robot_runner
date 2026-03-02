*** Settings ***
Documentation       This is the test 1

Resource            ../resources/chrome.resource

Suite Setup         Install The Chrome App
Suite Teardown      End The Test
Test Setup          Open The Chrome App
Test Teardown       Close The Chrome App


*** Test Cases ***
This is the first test case
    [Documentation]    This is the first test case
    [Tags]    chrome
    Sleep    5s
    Capture Page Screenshot
    Log To Console    \nThis is the first test case running on {${device_name}}(${udid}) with Android {${os_version}}

This is the second test case
    [Documentation]    This is the second test case
    [Tags]    chrome
    Sleep    5s
    Capture Page Screenshot
    Log To Console    \nThe test done something here
    Log To Console    \nAnd something else here
    Log    This is the second test case running on {${device_name}}(${udid}) with Android {${os_version}}