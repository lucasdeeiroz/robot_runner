*** Settings ***
Documentation       This is the test 2

Resource            ../resources/chrome.resource

Suite Setup         Install The Chrome App
Suite Teardown      End The Test
Test Setup          Open The Chrome App
Test Teardown       Close The Chrome App


*** Test Cases ***
This is the third test case
    [Documentation]    This is the third test case
    [Tags]    chrome
    Sleep    5s
    Capture Page Screenshot
    Log To Console    \nThis is the third test case
    Log    This is the third test case

This is the fourth test case
    [Documentation]    This is the fourth test case
    [Tags]    chrome
    Sleep    5s
    Capture Page Screenshot
    Log To Console    \nThis is the fourth test case
    Log To Console    \nAnd something else here
    Log    This is the fourth test case
