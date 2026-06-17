export const en = {
    translation: {
        presentation: {
            activated: "Presentation Mode activated",
            deactivated: "Presentation Mode deactivated",
            next: "Next",
            prev: "Back",
            reset: "Restart",
            slides: {
                welcome: {
                    title: "Robot Runner 2.2",
                    points: [
                        "Mobile test execution",
                        "Test analysis tools",
                        "QA tools centralization",
                        "Element inspection and screen documentation",
                        "AI support with product context"
                    ]
                },
                test_execution: {
                    title: "Mobile test execution",
                    points: [
                        "Select devices from dropdown menu",
                        "Connect devices via Wi-Fi",
                        "Select and customize test suites",
                        "Keep screen on during long tests"
                    ]
                },
                test_analysis: {
                    title: "Test analysis tools",
                    points: [
                        "Parallel execution visualization in grid mode",
                        "Evidence generation: screenshots, videos",
                        "Data generation: logcat and performance data",
                        "Real-time log visualization"
                    ]
                },
                toolbox: {
                    title: "QA tools centralization",
                    points: [
                        "Real-time screen streaming",
                        "Automatic Appium Server initialization",
                        "Autonomous control via ADB"
                    ]
                },
                inspector_mapper: {
                    title: "Element inspection and screen documentation",
                    points: [
                        "Real-time element inspection",
                        "Resilient locator generator",
                        "Screen mapping and documentation",
                        "Navigation flow viewer"
                    ]
                },
                ai_assistant: {
                    title: "AI Assistant",
                    points: [
                        "AI assistant with product context",
                        "Error debugging and reporting",
                        "Suggestions and optimizations",
                        "Board artifact generation"
                    ]
                },
                settings: {
                    title: "Settings",
                    points: [
                        "Project profiles",
                        "App, tools and execution settings",
                        "System versions",
                        "AI Provider settings"
                    ]
                }
            }
        },
        about: {
            description: "Information about Robot Runner and its creators.",
            long_description: "A modern, cross-platform GUI for Robot Framework and Appium, designed to simplify test automation workflows.",
            developed_by: "Developed by",
            lead: "Principal Developer",
            dev_collaborator: "Collaborating Developer",
            qa_collaborator: "Collaborating QA",
            powered_by: "Powered by",
            tools_title: "Tools Used",
            tools_desc: "Robot Runner is built on top of open-source giants:",
            tools_list: {
                tauri: { name: "Tauri", desc: "Lightweight framework for building secure desktop apps using web technologies." },
                react: { name: "React", desc: "JavaScript library for building dynamic and responsive user interfaces." },
                rust: { name: "Rust", desc: "Systems language providing critical performance and memory safety for the backend." },
                vite: { name: "Vite", desc: "Next-generation build tool enabling an ultra-fast development environment." },
                appium: { name: "Appium", desc: "Leading automation platform for native, hybrid, and mobile web testing." },
                robot: { name: "Robot Framework", desc: "Generic open source automation framework for acceptance testing." },
                maestro: { name: "Maestro", desc: "The simplest and most effective UI testing framework for mobile app automation." },
                maven: { name: "Maven", desc: "Reliable build automation tool used primarily for Java projects." },
                tailwind: { name: "TailwindCSS", desc: "Utility-first CSS framework for rapid and consistent styling." },
                lucide: { name: "Lucide", desc: "Beautiful and consistent vector icon library." }
            },
            legal_title: "Terms & License",
            license: "Non-Commercial / No-Resale license",
            license_desc: "This license allows free use, modification, and free redistribution of the Software, but prohibits selling, paid licensing, or other direct monetization of the Software.\n\n**Definitions:**\n\n- **'Software'** means the source code of this repository and any accompanying files, plus any compiled binaries/installers built from it, including modified versions.\n\n- **'Non-Commercial Use'** means use without charging fees for the Software itself. Non-Commercial Use includes personal use, educational use, and internal use by companies/organizations, even if such use provides indirect commercial benefit.\n\n- **'Commercialization'** means any direct monetization of the Software, including:\n  (a) selling the Software (source or binary), in whole or in part;\n  (b) licensing or sublicensing the Software for a fee;\n  (c) charging for access to the Software itself, including paywalled downloads;\n  (d) offering a 'paid version' of the Software that is substantially the same;\n  (e) bundling the Software into a paid product where the Software itself is a primary reason for payment.\n\nCharging for unrelated services is not prohibited (e.g., general consulting), as long as you are not charging for the Software itself.\n\n**Permissions (granted under this license):**\n\n1. You may use the Software for any purpose, including internal use by companies.\n2. You may copy and modify the Software.\n3. You may distribute the Software (source code and/or binaries/installers) for free.\n\n**Conditions:**\n\n**A. Attribution and Link Back** - Any redistribution of the Software (source or binary), modified or unmodified, must:\n- retain the above copyright notice and this license text; and\n- prominently include credit to the original author and a link to the original repository: https://github.com/lucasdeeiroz/robot_runner\n\n**B. Marking Changes** - If you distribute a modified version, you must clearly state that you modified it.\n\n**Restrictions:**\n\n1. You may not Commercialize the Software (as defined above) without written permission from the copyright holder.\n2. You may not remove or obscure the attribution/link-back requirements.",
            disclaimer: "The software is provided 'as is', without warranty of any kind, express or implied.",
            github_repo: "GitHub Repository",
            update_channel: "Update Channel",
            channel_stable: "Stable",
            channel_beta: "Beta",
            channel_alpha: "Alpha",
            update_check: "Check for Updates",
            update_available: "New version available: {{version}}",
            update_not_available: "You are up to date",
            update_error: "Failed to check for updates",
            checking: "Checking...",
            update_badge: "UPDATE",
            update_title: "New Version Available",
            update_select_installer: "Select the installer for your system",
            installer: "Installer",
            portable: "Portable",
            update_manual_hint: "The installer will open automatically after download.",
            view_releases: "View all releases on GitHub",
            update_downloaded: "Download complete! Opening installer...",
            update_download_error: "Failed to download update."
        },
        ai_agent: {
            title: "AI Agent",
            session_active: "Session Active",
            clear_session: "Clear",
            welcome_title: "Robot Runner AI",
            welcome_desc: "Hello, I am Rai! I can help you analyze logs, run tests, or navigate the application.",
            placeholder: "Ask me anything...",
            thinking: "Thinking...",
            action_proposed: "Action Proposed",
            confirm_execute: "Confirm & Execute",
            error: "Error communicating with AI: ",
            session_cleared: "Session cleared",
            action_unwired: "Action {{type}} is not yet fully wired to the backend.",
            settings_updated: "Updated {{key}}",
            executing_action: "Executing Action: {{type}}",
            redirect_to_tests: "Redirecting to Tests panel to configure and run {{type}}.",
            speak_title: "Read response aloud",
            stop_speak_title: "Stop speaking",
            mic_active: "Listening...",
            mic_inactive: "Voice input",
            mic_permission_error: "Microphone permission error or not supported",
            file_path_missing: "File path is missing for action",
            confirm_file_deletion: "Confirm File Deletion",
            confirm_file_modification: "Confirm File Modification",
            confirm_file_creation: "Confirm File Creation",
            path: "Path:",
            original_content: "Original Content",
            new_content: "New Content",
            cancel: "Cancel",
            confirm: "Confirm",
            file_deleted: "File deleted successfully.",
            file_created: "File created successfully.",
            file_modified: "File modified successfully.",
            file_action_failed: "Failed to execute file action: ",
            invalid_automation_root: "Automation root is not configured. Please set a valid automation root before running a test.",
            no_active_device: "No active device selected.",
            context_requested: "Reading additional context from {{file}}...",
            suggested_prompts: {
                settings: "\"Go to settings\"",
                color: "\"Change my primary color to green\"",
                help: "\"What can you do?\""
            }
        },
        ai_page: {
            title: "AI Assistant",
            powered_by: "Powered by Google Gemini",
            welcome: "Hello! I'm your Robot Framework assistant, accessible via Google Gemini. How can I help you write or debug your tests today?",
            placeholder: "Ask about Robot Framework or your test results...",
            thinking: "Thinking...",
            error: "Sorry, I encountered an error connecting to the AI service."
        },
        apps: {
            fetch_error: "Failed to fetch packages",
            install_error: "Failed to install APK",
            actions: {
                uninstall_title: "Uninstall Package",
                uninstall_confirm: "Are you sure you want to uninstall {{pkg}}?",
                disable_title: "Disable App",
                enable_title: "Enable App",
                disable_confirm: "Disable {{pkg}}?",
                enable_confirm: "Enable {{pkg}}?",
                clear_title: "Clear Data",
                clear_confirm: "Clear all data for {{pkg}}?",
                install: "Install APK",
                uninstall: "Uninstall",
                disable: "Disable",
                enable: "Enable",
                clear: "Clear Data",
                sort_by_name: "Sort by Name",
                sort_by_package: "Sort by Package",
                refresh: "Refresh List",
                allow_downgrade: "Allow Downgrade (-d)",
                grant_permissions: "Grant Permissions (-g)",
                allow_test: "Allow Test APKs (-t)",
                install_sdcard: "Install to SD Card (-s)"
            },
            search_placeholder: "Search packages...",
            toggle_system: "Toggle System Apps",
            no_device: "No device selected",
            no_packages: "No packages found",
            status: {
                installing: "Installing APK...",
                disabled_badge: "Disabled",
                paused_test: "App list refresh paused during test"
            },
            success: {
                uninstalled: "Package {{pkg}} uninstalled successfully",
                disabled: "Package {{pkg}} disabled",
                enabled: "Package {{pkg}} enabled",
                cleared: "Data cleared for {{pkg}}",
                installed: "APK installed successfully"
            },
            error: {
                install_failed: "Installation failed: {{error}}"
            }
        },
        commands: {
            title: "ADB Commands",
            parse_error: "Failed to parse saved commands",
            cancel_error: "Failed to cancel command",
            empty: "Select a device to execute commands",
            input_placeholder: "Enter ADB command (e.g. 'shell ls -la')",
            waiting: "Waiting for commands...",
            status: {
                test_running: "Test execution in progress"
            },
            clear: "Clear Console",
            quick: "Quick",
            saved: "Saved",
            actions: {
                ip_address: "IP Address",
                list_packages: "List Packages",
                battery: "Battery",
                reboot: "Reboot",
                save: "Save",
                send: "Send",
                delete_confirm: "Delete this saved command?"
            },
            modal: {
                title: "Save Custom Command",
                label: "Label",
                placeholder: "e.g. List Files",
                command: "Command",
                cancel: "Cancel",
                save: "Save Command"
            }
        },
        common: {
            start: "Start",
            pause: "Pause",
            reset: "Reset",
            loading_taking_too_long: "Loading is taking longer than expected...",
            continue_anyway: "Continue anyway",
            refresh: "Refresh",
            online: "Online",
            cloud_sync: "Synced to Cloud",
            offline: "Offline",
            try_again: "Try Again",
            beta: "Beta",
            cancel: "Cancel",
            save: "Save",
            saved: "Saved",
            save_and_run: "Save and Run",
            run: "Run",
            undo: "Undo",
            redo: "Redo",
            next: "Next",
            back: "Back",
            finish: "Finish",
            collapse: "Collapse",
            expand: "Expand",
            copy: "Copy",
            copied: "Copied!",
            download: "Download",
            downloading: "Downloading...",
            clear: "Clear",
            coming_soon: "Module {{module}} coming soon...",
            error_occurred: "An error occurred: {{error}}",
            failed_to_pull_video: "Failed to pull video",
            failed_to_pull_screenshot: "Failed to pull screenshot from device",
            delete: "Delete",
            edit: "Edit",
            go_to_settings: "Go to Settings",
            ok: "OK",
            done: "Done",
            search: "Search...",
            loading: "Loading...",
            please_wait: "Please wait...",
            select: "Select...",
            minimize: "Minimize",
            maximize: "Maximize",
            close: "Close",
            confirm: "Confirm",
            attention: "Attention",
            running: "Running",
            pass: "Completed",
            fail: "Error",
            errors: {
                open_file_failed: "Failed to open file or folder",
                open_link_failed: "Failed to open link",
                parse_failed: "Failed to parse data"
            }
        },
        components: {
            ai_button: {
                customize_prompt: "Customize Prompt",
                custom_rule_active: "Custom rule active",
                customize_description: "Add specific instructions or custom rules to the AI prompt. The instructions defined here will take precedence (overwrite) the default behavior of the artificial intelligence for this button.",
                customize_placeholder: "Ex: Always answer in this specific format... or Ignore tests with the tags...",
                reset_prompt: "Restore default prompt",
                clear: "Clear"
            },
            logo: {
                load_error: "Failed to load logo"
            }
        },
        connect: {
            wireless: {
                title: "Wireless Connection",
                desc: "Connect to devices via Wi-Fi ADB"
            },
            remote: {
                title: "Remote Access (Ngrok)",
                desc: "Expose ADB Device to the internet"
            },
            labels: {
                ip: "IP Address",
                port: "Port",
                code: "Pairing Code (Optional)",
                config: "Configuration",
                expose_port: "Expose Port",
                token: "Token",
                missing_token: "Missing (Check Settings)"
            },
            actions: {
                connect: "Connect",
                copy: "Copied!",
                disconnect: "Disconnect",
                disconnect_all: "Disconnect All",
                enable_remote: "Enable Remote Connection",
                enable_tcpip: "Enable 5555",
                enable_tcpip_tooltip: "Run 'adb tcpip 5555'",
                pair: "Pair",
                paste_url: "Paste URL",
                rerun_failed: "Re-run Failed Tests",
                start_tunnel: "Start Public Tunnel",
                stop_tunnel: "Stop Tunnel"
            },
            status: {
                tunnel_active: "Tunnel Active",
                starting_ngrok: "Starting Ngrok Tunnel...",
                pasted: "Pasted from clipboard",
                clipboard_invalid: "Invalid format in clipboard",
                clipboard_error: "Clipboard permission denied",
                auto_ip: "Auto-detected IP",
                ip_not_found: "Could not detect Device IP via ADB",
                select_device_first: "Select a device to expose",
                forwarding: "Forwarding to localhost:5555 (ADB)",
                executing_connect: "Connecting...",
                executing_pair: "Pairing...",
                executing_disconnect: "Disconnecting...",
                connection_failed: "Connection failed",
                pairing_failed: "Pairing failed",
                connection_success: "Connected to {{target}}",
                pairing_success: "Successfully paired with {{target}}",
                disconnection_success: "Disconnected from {{target}}",
                disconnected_all: "Disconnected all devices",
                tunnel_stopped: "Ngrok Tunnel Stopped",
                tunnel_stop_error: "Error stopping Ngrok",
                tunnel_start_error: "Error starting Ngrok",
                payment_required_title: "Ngrok Payment Required",
                payment_required_desc: "Free ngrok accounts require a valid credit card to use TCP tunnels. You won't be charged.",
                add_card: "Add Card",
                cancel_card: "Cancel",
                enabling_tcpip: "Enabling TCP/IP 5555...",
                tcpip_enabled: "TCP/IP 5555 Enabled",
                tcpip_failed: "Failed to enable TCP/IP",
                command_not_allowed: "Command not allowed on this device"
            },
            security_warning: {
                title: "Security Warning",
                message: "Enabling remote connection (Ngrok) will expose your local device to the internet.\n\nEnsure this complies with your organization's Information Security policies before proceeding.",
                cancel: "Cancel",
                confirm: "Enable Ngrok"
            }
        },
        console: {
            waiting: "Waiting for output..."
        },
        dashboard: {
            title: "QA Dashboard",
            description: "Auxiliary tools for QA: Scenario generation, image editing and documentation.",
            editor: {
                title: "Generated Content",
                scenario_input: "Requirements & Context"
            },
            tabs: {
                scenarios: "AI Generator",
                images: "Image Editor",
                history: "History",
                mapper: "Mapper"
            },
            history: {
                title: "File History",
                empty: "No files generated."
            },
            image: {
                title: "Image Editor",
                new: "New Image / Paste",
                open: "Open Image",
                opened: "Image Loaded!",
                copy: "Copy Image",
                pasted: "Image pasted!",
                no_clipboard: "No image in clipboard.",
                copied: "Copied to clipboard!",
                tools: {
                    cursor: "Cursor",
                    arrow: "Arrow",
                    rect: "Rectangle",
                    crop: "Crop Area"
                }
            },
            generator: {
                title: "AI Artifact Generator",
                input_label: "Requirements / Acceptance Criteria",
                input_placeholder: "Paste your requirements, user story, or bug description here...",
                use_mapping: "Use App Mapping",
                use_mapping_hint: "Include screen elements in AI context for more precise generation",
                type_label: "Generation Type",
                generate_button: "Generate with AI",
                generating: "Generating...",
                key_required: "{{provider}} API Key required. Please configure it in Settings.",
                types: {
                    test_case: "Test Cases (BDD)",
                    test_case_traditional: "Test Cases (Traditional / Step-by-Step)",
                    pbi: "Product Backlog Item (PBI)",
                    improvement: "Functional Improvement",
                    bug: "Bug Report"
                },
                empty_state: "Generated content will appear here...",
                success: "Artifact generated successfully using {{method}}"
            },
            actions: {
                generate: "Generate Scenarios",
                generated_success: "TEST CASES GENERATED SUCCESSFULLY (via {{method}})",
                ai_failed: "AI generation failed: {{error}}",
                using_local_generator: "Using local generator. {{message}}",
                export_xlsx: "Excel (.xlsx)",
                export_docx: "Word (.docx)"
            },
            export: {
                success: "Exported successfully!",
                error: "Export error"
            }
        },
        devices: {
            load_error: "Failed to load devices"
        },
        feedback: {
            success: "Success",
            error: "Error",
            saved: "Saved successfully",
            test_started: "Test Execution Started",
            test_finished: "Test Execution Finished",
            test_passed: "Test Suite Passed",
            test_failed: "Test Suite Failed",
            appium_started: "Appium Server Started",
            appium_stopped: "Appium Server Stopped",
            adb_connected: "Wireless ADB Connected",
            remote_connected: "Remote Access Connected",
            recording_saved: "Screen Recording Saved",
            recording_started: "Recording Started",
            inspector_updated: "Inspector Updated",
            logcat_saved: "Logcat Saved",
            performance_saved: "Performance Stats Saved",
            mirror_launched: "Device Mirror Launched",
            screenshot_saved: "Screenshot Saved",
            profile_changed: "Settings Profile Changed",
            adb_restarting: "Restarting ADB server...",
            adb_restarted: "ADB server restarted successfully",
            details: {
                device: "Device: {{device}}",
                path: "Path: {{path}}",
                url: "URL: {{url}}"
            },
            saved_to_prefix: "File saved to:"
        },
        file_explorer: {
            list_error: "Failed to list directory",
            error: "Failed to load directory",
            up: "Go Up",
            loading: "Loading...",
            reset: "Reset to Root",
            empty: "Empty directory",
            current: "Current directory",
            no_selection: "No selection",
            cancel: "Cancel",
            select_file: "Select File",
            select_folder: "Select Folder",
            select_generic: "Select",
            not_configured: "Path not configured",
            configure_tests: "Please configure the Tests Directory in Settings or select it below.",
            configure_suites: "Please configure the Suites Directory in Settings or select it below.",
            select_folder_btn: "Select Folder",
            git_commit_title: "Commit Changes",
            git_commit_btn_tooltip: "Commit staged changes",
            git_push: "Push to remote",
            pushing: "Pushing...",
            push: "Push",
            git_commit_message_label: "Commit Message",
            git_commit_placeholder: "e.g. update test scripts",
            committing: "Committing...",
            commit: "Commit",
            staged_success: "Staged {{file}} successfully",
            git_commit_success: "Successfully committed changes!",
            git_push_success: "Successfully pushed changes to remote repository!",
            git_stage_tooltip: "Stage changes",
            git_stage: "Stage",
            git_status_modified: "Modified",
            git_status_staged: "Staged (Ready to Commit)",
            git_status_untracked: "Untracked",
            git_status_deleted: "Deleted",
            git_fetch_tooltip: "Fetch from remote",
            git_fetch_success: "Fetched from remote successfully.",
            git_pull_tooltip: "Pull from remote",
            git_pull_success: "Successfully pulled changes from remote.",
            git_push_tooltip: "Push to remote",
            git_unstage_tooltip: "Unstage changes",
            unstaged_success: "Unstaged {{file}} successfully"
        },
        inspector: {
            overlay: {
                title: "Available Actions",
                hover: {
                    title: "Hover",
                    desc: "Move pointer to highlight"
                },
                select: {
                    title: "Select",
                    desc: "Click to select element"
                },
                tap: {
                    title: "Tap",
                    desc: "Double click to interact"
                },
                swipe: {
                    title: "Swipe",
                    desc: "Drag to swipe"
                }
            },
            title: "Inspector",
            live_sync: "Live Sync",
            update_error: "Failed to update inspector",
            input_error: "Failed to send input",
            empty: "Select a device to start Inspector",
            refresh: "Refresh Source",
            export_xml: "Export XML",
            export_xml_success: "XML successfully exported!",
            export_xml_error: "Failed to export XML",
            export_xml_no_data: "No XML data loaded to export.",
            search: {
                placeholder: "Search by ID, XPath, etc...",
                clear: "Clear Search"
            },
            modes: {
                inspect: "Inspect Mode",
                tap: "Tap Mode",
                swipe: "Swipe Mode"
            },
            status: {
                fetching: "Fetching device state...",
                ready: "Ready",
                loading: "Loading...",
                no_screenshot: "No screenshot",
                hierarchy_available: "UI Hierarchy loaded (Interactions active)",
                paused_test: "Inspector disabled during test",
                web_mode_title: "Mobile-Optimized Inspector",
                web_mode_desc: "Visual Inspector is optimized for Mobile Automation (Android & iOS). For Web applications, please use the browser's native developer tools (e.g., Chrome DevTools) or the Cypress Test Runner's interactive panel to inspect elements in real-time.",
                web_mode_action: "Launch DevTools",
                web_mode_info: "Open Chrome DevTools by pressing F12 or Right Click > Inspect in your web browser."
            },
            properties: "Node Properties",
            select_element: "Select an element on the screenshot",
            nav: {
                home: "Home",
                back: "Back",
                recents: "Recents"
            },
            modal: {
                edit_xpath: "Edit XPath",
                edit_uiselector: "Edit UIAutomator Selector",
                edit_selector: "Edit Selector",
                match_type: "Match Type",
                match_type_equals: "Equals",
                match_type_contains: "Contains",
                match_type_starts_with: "Starts With",
                match_type_ends_with: "Ends With",
                match_type_regex: "Regex/Matches",
                preferred_attr: "Preferred Attribute",
                preferred_attr_resource_id: "Resource ID",
                preferred_attr_text: "Text",
                preferred_attr_content_desc: "Content Desc",
                preferred_attr_class: "Class Only",
                result: "Result",
                use_wrapper: "Use new UiSelector() wrapper",
                additional_attrs: "Additional Attributes",
                attr_resource_id: "Resource ID",
                attr_text: "Text",
                attr_content_desc: "Content Desc",
                attr_class: "Class",
                attr_index: "Index",
                attr_clickable: "Clickable",
                attr_enabled: "Enabled",
                attr_checked: "Checked",
                attr_selected: "Selected",
                attr_focusable: "Focusable",
                attr_instance: "Instance",
                attr_long_clickable: "Long Clickable",
                attr_focused: "Focused",
                attr_scrollable: "Scrollable",
                attr_checkable: "Checkable",
                kinship_method: "Kinship Method",
                kinship_none: "None",
                kinship_child_selector: "Child Selector",
                kinship_from_parent: "From Parent"
            },
            attributes: {
                copied: "Copied!",
                all: "All Attributes",
                xpath: "XPath",
                resource_id: "Resource ID",
                access_id: "Accessibility ID",
                uiselector: "UIAutomator",
                class: "Class",
                identifiers: "Identifiers",
                hierarchy: "Hierarchy",
                ai_suggest: "AI Suggestion",
                suggest_with_ai: "Suggest with AI",
                suggest_ai_placeholder: "Let AI help you find the most stable selector for this element.",
                suggested_selector: "Suggested Selector",
                ai_rationale: "AI Rationale",
                rationale: "Rationale",
                ai_error_generic: "AI suggestion failed.",
                ai_error_quota: "AI quota exhausted. {{detail}}",
                ai_error_auth: "AI authentication failed. Check your API key."
            },
            recorder: {
                title: "Steps Recorder",
                start: "Start Recording",
                stop: "Stop Recording",
                steps: "Recorded Steps",
                clear: "Clear Steps",
                copy: "Copy Code",
                empty: "No steps recorded yet",
                actions: {
                    tap: "Tap",
                    double_tap: "Double Tap",
                    long_press: "Long Press",
                    swipe: "Swipe",
                    drag_drop: "Drag & Drop"
                },
                directions: {
                    up: "Up",
                    down: "Down",
                    left: "Left",
                    right: "Right"
                },
                params: {
                    duration: "Duration (ms)",
                    offset_x: "Offset X",
                    offset_y: "Offset Y",
                    start_offset: "Start Offset %",
                    end_offset: "End Offset %"
                },
                selection: "Active Selection",
                siblings: "Alternative Nodes (Same position)"
            }
        },
        logcat: {
            title: "Logcat",
            errors: {
                fetch_failed: "Failed to fetch logcat",
                start_failed: "Failed to start logcat",
                stop_failed: "Failed to stop logcat",
                app_not_running: "App not running: {{pkg}}"
            },
            status: {
                paused_test: "Logcat paused during test",
                waiting: "Waiting for logs...",
                empty: "No logs captured"
            },
            saving: "Saving logcat to",
            start: "Start",
            stop: "Stop",
            filter: "Filter App",
            entire_system: "Entire System",
            no_packages: "No packages configured",
            level: "Log Level",
            clear: "Clear Logs",
            lines: "lines",
            no_logs: "No logs captured",
            select_device: "Select a device to view logs",
            ai_analyze_button: "Analyze with AI",
            ai_analysis_title: "AI Analysis Result",
            analyzing: "Analyzing logs...",
            not_saving: "Not saving to file",
            configure_path: "Configure Path",
            select_dir_title: "Select Directory for Logcat"
        },
        mapper: {
            title: "Mapper",
            empty: "Select a device to start mapping",
            web_mode_title: "Mobile-Optimized Mapper",
            web_mode_desc: "Element Mapper is optimized for Mobile Automation (Android & iOS). For Web applications, we recommend structuring your elements directly within your page object models (POMs) or locator libraries.",
            web_mode_action: "Learn More",
            web_mode_info: "Web elements are defined directly in your Cypress specs or page objects.",
            refresh: "Refresh Source",
            screen_description: "Screen Description",
            grouping: {
                all_screens: "All Screens",
                by_tags: "By Tags",
                all_elements: "All Elements",
                by_type: "By Type",
                no_tags: "No Tags"
            },
            flowchart: {
                open: "Open Flowchart",
                export: "Export Flow",
                export_image: "Export Image",
                import: "Import Flow",
                migrating: "Migrating layout data...",
                migration_success: "Layout Migration Complete",
                migration_error: "Migration failed",
                save_error: "Failed to save decentralized layout",
                no_changes: "No layout changes to save",
                save_connection_error: "Failed to save connection",
                port_occupied: "Port already occupied",
                export_success: "Flow exported successfully!",
                import_success: "Flow imported successfully!",
                export_error: "Failed to export flow",
                import_error: "Failed to import flow",
                reorganize: "AI Organize Layout",
                reorganized: "Layout reorganized (BFS)",
                ai_key_missing: "Missing AI API Key. Using standard reorganization...",
                reorganized_ai: "Layout reorganized by AI",
                reorganize_ai_error: "AI Reorganization failed. Falling back to BFS.",
                quick_connect: "Quick Connect",
                source_element: "Source Element",
                target_screen: "Target Screen",
                select_element: "Select Element",
                select_target: "Select Target",
                connect: "Connect",
                cancel: "Cancel",
                no_elements: "No mapped elements available.",
                title: "Navigation Flow",
                center_view: "Center View",
                filter_by_tag: "Filter by Tag",
                all_tags: "All",
                pan_mode: "Pan Mode (Hold Space)",
                zoom_in: "Zoom In",
                zoom_out: "Zoom Out",
                center: "Center View",
                filter_tags: "Filter by Tag",
                select_source_element: "Please select a source element",
                element_not_found: "Source element not found",
                ai_missed_count: "{{count}} screens not mapped by AI",
                ai_missed_help: "These screens were placed in the quarantine area on the right. Drag them to their places or complete the mapping if they are incomplete.",
                no_preview: "No preview recorded",
                clear_curvatures: "Clear all curvatures",
                curvatures_cleared: "All edge curvatures have been cleared",
                save_success: "Layout saved successfully!",
                load_error: "Failed to load flowchart layout",
                reorganize_success: "Layout reorganized successfully!",
                reorganize_error: "AI reorganization failed",
                reorganize_cancelled: "AI reorganization cancelled",
                reorganizing: "Reorganizing layout with AI...",
                exporting_image: "Generating high-resolution image...",
                export_image_success: "Image exported successfully",
                export_image_error: "Failed to export flowchart image",
                exploration_active: "AUTONOMOUS EXPLORATION ACTIVE",
                unsaved_changes: {
                    title: "Unsaved Changes",
                    message: "You have unsaved changes. Do you want to save before exiting?",
                    save_and_exit: "Save and Exit",
                    exit_without_saving: "Exit without Saving",
                    cancel: "Cancel"
                }
            },
            properties: "Properties",
            properties_element: "Element Properties",
            properties_screen: "Screen Properties",
            clear_selection: "Clear Selection",
            section_title: "Screen Mapper",
            screen_mapper: "Screen Mapper",
            screen_settings: "Screen Settings",
            saved_screens: "Saved Screens",
            saved_elements: "Saved Elements",
            no_saved_maps: "No saved maps found",
            no_saved_elements: "No elements mapped",
            items: "items",
            elements_mapped_count: "{{count}} elements mapped",
            elements_mapped: "elements mapped",
            select_element: "Select an element on the screenshot",
            types: {
                button: "Button",
                input: "Input",
                text: "Text",
                link: "Link",
                toggle: "Toggle",
                checkbox: "Checkbox",
                image: "Image",
                menu: "Menu",
                scroll_view: "Scroll View",
                tab: "Tab"
            },
            screen_name: "Screen Name",
            screen_type: "Screen Type",
            screen_tags: "Tags",
            screen_types: {
                screen: "Screen",
                modal: "Modal",
                tab: "Tab",
                drawer: "Drawer",
                dialog: "Dialog",
                tab_content: "Tab Content",
                overlay: "Overlay",
                undefined: "Screen"
            },
            migration: {
                title: "Mapping Migration",
                message: "We detected that you changed the mappings directory, but the new location is empty while the old one contains data. Do you want to copy the existing mappings to the new directory?",
                copy: "Copy Files",
                ignore: "Keep Empty",
                success: "Mappings migrated successfully!",
                error: "Failed to migrate mappings."
            },
            exploration: {
                start: "AI Auto Mapping",
                stop: "Stop",
                active: "AI Exploring...",
                thinking: "Thinking...",
                error_empty_guidelines: "The exploration objective or guideline cannot be empty.",
                step_title: "Step {{number}}",
                initialization: "Initialization",
                events_logged: "{{count}} events logged",
                rationale_title: "Rationale & Analysis",
                ai_title: "AI Analysis",
                with_text: "with",
                elements_text: "elements",
                action_title: "Action",
                clicking: "Clicking",
                swiping: "Swiping",
                typing: "Typing",
                navigating: "Navigating",
                element_text: "element",
                error_title: "Error",
                stopped_title: "Exploration stopped",
                finished_title: "Exploration finished",
                summary: "Exploration Ended",
                stopped: "Exploration stopped: {{reason}}",
                cancelled: "Exploration cancelled",
                ai_thought: "AI Thought",
                mapped_new_screen: "Mapped new screen: {{screenName}}",
                target_package_identified: "Target package identified: {{pkg}}",
                capturing_screen: "Capturing screen...",
                analyzing_screen: "Analyzing screen with {{provider}}...",
                preparing_context: "Preparing optimized AI context...",
                ai_mapped_summary: "AI mapped: {{name}} ({{type}}) with {{count}} elements.",
                rationale: "Rationale",
                loop_detected: "Loop detected: screen \"{{name}}\" visited {{count}} times with repeated actions. Forcing back to escape.",
                finished: "Exploration finished by AI.",
                navigating_back: "Navigating back...",
                clicking_element: "Clicking element: {{targetId}} ({{details}})",
                swiping_action: "Swiping {{direction}}...",
                typing_action: "Typing text on {{targetId}}: {{text}}",
                recovering_exit: "App exit detected (Current: {{current}}, Target: {{target}}). Recovering...",
                ai_suggested_layout: "AI suggested layout for {{name}} at ({{x}}, {{y}})",
                swipe_limit_reached: "Max swipe limits reached (10). Forcing navigation back.",
                stopped_reason: "Exploration stopped: {{reason}}",
                step_marker: "--- Step {{step}} ---",
                malformed_json_retry: "AI returned malformed JSON. Retrying... ({{error}})",
                back_updated: "Back-updated \"{{prev}}\" → element navigates to \"{{current}}\"",
                merging_insights: "Merging AI insights into existing screen: \"{{name}}\" (ID: {{id}}, {{count}} elements)",
                new_elements_discovered: "Added {{count}} new elements discovered by AI. Total: {{total}}",
                analyzing_prompt: "Analyzing prompt...",
                summary_initial: "Initial Graph Summary",
                summary_final: "Final Graph Summary (Exploration Ended)",
                summary_screens: "- Screens: {{exhausted}} Exhausted, {{exploring}} Exploring, {{unexplored}} Unexplored",
                summary_elements: "- Elements: {{exhausted}} Exhausted, {{exploring}} Exploring, {{unexplored}} Unexplored",
                heuristic_scroll: "Heuristic: no unvisited elements, trying to scroll",
                heuristic_scroll_reverse: "Heuristic: scroll reverse, no new elements found",
                heuristic_back: "Heuristic: stuck, going back",
                heuristic_type: "Heuristic: type text into unvisited input",
                heuristic_click: "Heuristic: click unvisited element"
            },
            enhancer: {
                title: "Audit & Enhance Maps",
                description: "This tool will programmatically remove duplicates, standardize elements, and use AI to generate semantic names and descriptions for your saved screens.",
                ready: "Ready to process {{count}} screens.",
                btn_cancel: "Cancel",
                btn_close: "Close",
                btn_start: "Start Enhancement",
                btn_enhancing: "Enhancing...",
                btn_done: "Done",
                btn_audit_enhance: "Audit & Enhance",
                completed: "Audit and Enhancement Completed",
                starting_linter: "Starting Programmatic Linter...",
                removed_duplicates: "Removed {{count}} duplicates from {{name}}",
                no_enhancement_needed: "All screens and elements are already semantically named. No AI enhancement needed.",
                cli_fallback: "CLI provider selected. Falling back to Gemini for Batch Enhancement.",
                api_key_required: "API key is required. Stopping after programmatic Linter.",
                found_screens: "Found {{count}} screens needing AI enhancement. Processing in batches...",
                processing_batch: "Processing AI batch {{current}}/{{total}}..."
            },
            modes: {
                inspect: "Inspect Mode",
                tap: "Tap Mode",
                swipe: "Swipe Mode"
            },

            status: {
                saving: "Saving...",
                fetching: "Fetching device state...",
                ready: "Ready",
                loading: "Loading...",
                no_screenshot: "No screenshot",
                paused_test: "Mapper disabled during test"
            },
            nav: {
                home: "Home",
                back: "Back",
                recents: "Recents"
            },
            attributes: {
                copied: "Copied!",
                xpath: "XPath",
                resource_id: "Resource ID",
                access_id: "Accessibility ID",
                identifiers: "Identifiers",
                hierarchy: "Hierarchy",
                ai_suggest: "AI Suggestion",
                suggested_selector: "Suggested Selector",
                rationale: "Rationale"
            },
            input: {
                element_type: "Element Type",
                element_name: "Element Name",
                element_description: "Element Description",
                screen_description: "Screen Description",
                navigates_to: "Navigates To (Optional)",
                menu_options: "Menu Options (Comma separated)",
                parent_screen: "Parent Screen",
                select_existing: "Select Existing Element"
            },
            placeholder: {
                select_element: "Choose an element to edit...",
                element_name: "e.g. Login Button",
                navigates_to: "Screen Name",
                menu_options: "Option 1, Option 2...",
                parent_screen: "Parent Screen Name",
                screen_name: "Screen Name (Unique)",
                screen_tags: "e.g. Auth, Profile",
                screen_description: "Description for AI context..."
            },
            action: {
                back_to_screen: "Back to Screen",
                back: "Back",
                add: "Add Element",
                update: "Update Element",
                remove: "Remove Element",
                save_screen: "Save Screen",
                load: "Load",
                ai_suggest_name: "Suggest Name with AI",
                ai_suggest_tags: "Suggest Tags with AI",
                copy_result: "Copy Result",
                copy_analysis: "Copy Analysis",
                export_pom: "Export POM",
                export_project_pom: "Export Project to POM",
                new: "New",
                discard: "Discard",
                discard_desc: "Discard Screen",
                delete: "Delete",
                toggle_stay_awake: "Toggle Keep Screen Awake",
                export_json: "Export JSON",
                import_json: "Import JSON",
                export_image: "Export Image",
                save_logs: "Save Logs"
            },
            feedback: {
                mapped: "Element mapped!",
                updated: "Element Updated",
                removed: "Element removed",
                empty_map: "No elements mapped yet",
                saved: "Screen mapped successfully!",
                loaded: "Screen map loaded",
                ai_suggesting: "Asking AI for name...",
                ai_success: "Name suggested!",
                ai_error: "Failed to suggest name",
                new_screen: "Ready for new screen",
                deleted: "Map deleted",
                stay_on_enabled: "Stay Awake enabled",
                stay_on_disabled: "Stay Awake disabled",
                logs_saved: "Logs saved successfully"
            },
            error: {
                missing_name: "Please provide a name for the element",
                missing_screen_name: "Please provide a Screen Name",
                save_failed: "Failed to save screen map",
                stay_on_failed: "Failed to change Stay Awake state",
                logs_save_failed: "Failed to save logs"
            },
            confirm: {
                delete: "Are you sure you want to delete this map?",
                delete_title: "Delete Screen Map?",
                delete_desc: "Are you sure you want to delete this screen map? This action cannot be undone.",
                discard: "Discard current changes?"
            }
        },
        performance: {
            fetch_error: "Failed to fetch stats",
            save_error: "Failed to save performance data",
            record_error: "Failed to start recording",
            title: "Device Performance",
            auto_on: "Auto-Refresh On",
            auto_off: "Auto-Refresh Off",
            refresh: "Refresh Now",
            cpu: "CPU Usage",
            ram: "RAM Usage",
            battery: "Battery",
            load: "load",
            used: "used",
            loading: "Loading stats...",
            error: "Failed to fetch device stats",
            start_record: "Start Recording",
            stop_record: "Stop Recording",
            recording: "Recording...",
            recording_started: "Recording performance stats...",
            select_device: "Select a device to view performance stats.",
            system_only: "Entire System",
            device_stats: "Device Performance",
            app_stats: "App Performance",
            auto: "Auto",
            na: "N/A",
            warning_high_impact: "Activating monitoring during a test can cause ADB congestion and lead to execution failures (Socket Hang Up).",
            warning_high_impact_title: "High Impact Warning",
            warning_high_impact_detail: "Proceed only if investigation of performance issues is strictly necessary.",
            force_enabled_msg: "Monitoring forced during test",
            paused_description: "Performance polling is disabled to avoid interference with the running test.",
            status: {
                paused_test: "Monitoring Paused"
            },
            actions: {
                force_enable: "Force Enable"
            },
            manual_save_hint: "Note: Recordings will use a manual 'Save As' dialog if the logs path is missing. Configure it in Settings for automatic saving.",
            select_dir_title: "Select Directory for Performance Reports"
        },
        run_tab: {
            launcher: "Launcher",
            connect: "Connect",
            inspector: "Inspector",
            commands: "Commands",
            device: {
                no_device: "No Device Selected",
                no_devices_found: "No devices found",
                selected_count: "{{count}} Devices Selected",
                select: "Select Devices",
                busy: "Busy",
                refresh: "Refresh Devices",
                open_toolbox: "Open Toolbox"
            },
            console: {
                documentation: "Documentation",
                return_value: "Return Value",
                error_message: "Error Message",
                screenshot: "Screenshot",
                artifacts: "Artifacts",
                open_log: "Open HTML Log",
                open_report: "Open Report",
                pass: "PASS",
                fail: "FAIL",
                not_run: "NOT RUN",
                interrupted: "INTERRUPTED",
                fancy_mode: "Fancy Mode",
                raw_mode: "Raw Mode",
                running: "RUNNING",
                stopping: "Generating reports...",
                processing: "Processing...",
                test_summary: "{{total}} TESTS: {{passed}} PASSED, {{failed}} FAILED",
                waiting: "Waiting for logs...",
                loading_xml: "Loading execution data...",
                progress_parsing_xml: "Parsing XML...",
                progress_mapping_structure: "Mapping suite structure...",
                progress_compressing_cache: "Compressing cache...",
                progress_loading_tree: "Loading Log Tree...",
                optimizing_view: "Optimizing execution view...",
                failure_detail: "Failure Detail",
                step_screenshot: "Step Screenshot",
                view_fullscreen: "VIEW FULLSCREEN",
                failure_screenshot: "Failure Screenshot",
                keyword_screenshot: "Keyword Screenshot",
                loading_children: "Loading details...",
                node_types: {
                    suite: "SUITE",
                    test: "TEST",
                    keyword: "KW",
                    setup: "SETUP",
                    teardown: "TEARDOWN",
                    "for": "FOR",
                    iteration: "ITER",
                    "if": "IF",
                    "else-if": "ELSE IF",
                    "else": "ELSE",
                    "while": "WHILE",
                    "break": "BREAK",
                    "continue": "CONTINUE"
                },
                keep_awake: "Keep Screen Awake",
                open_output_dir: "Open Results Folder",
                debug_on: "Show Debug Logs",
                debug_off: "Hide Debug Logs",
                analyze_failure: "Analyze Failure",
                analyzing: "Analyzing...",
                ai_insight: "AI Insight",
                ai_analysis: "AI Analysis",
                ai_analysis_header: "Detailed Analysis",
                summarize_run: "Summarize Execution",
                generate_ai_test: "Generate Robot Test (AI)",
                summary_title: "Execution Summary",
                summary_rationale: "Analysis Basis",
                ai_analysis_placeholder: "Click to perform a smart root cause analysis using AI.",
                ai_analysis_error: "AI analysis failed",
                ai_error_generic: "AI analysis failed.",
                ai_error_quota: "AI quota exhausted. {{detail}}",
                ai_error_auth: "AI authentication failed. Check your API key.",
                ai_error_details: "Error Details:",
                ai_error_copy: "Copy Error",
                ai_history: {
                    title: "Smart History Analysis",
                    failures_limit: "Failures to analyze",
                    token_estimate: "Estimated consumption",
                    start_analysis: "Start Trend Analysis",
                    regenerate: "Regenerate Analysis",
                    last_analysis_on: "Last analysis performed on {{date}}",
                    no_analysis: "No previous analysis for this history yet.",
                    tokens: "tokens",
                    loading_context: "Extracting compressed context...",
                    success: "Trend analysis completed!",
                    persistence_note: "This analysis will be saved until you request a new one."
                },
                ai_steps: {
                    dumping: "Dumping screen hierarchy...",
                    thinking: "AI is thinking...",
                    executing: "Executing: {{action}}",
                    waiting: "Waiting for transition...",
                    finished: "Goal completed successfully!",
                    failed: "AI Agent failed to complete the goal."
                }
            }
        },
        scrcpy: {
            title: "Screen Mirroring",
            description: "Launch Scrcpy to mirror and control this device's screen in a separate window.",
            start: "Start Mirroring",
            starting: "Starting...",
            note: "Note: Scrcpy must be installed on your system's PATH. The mirror window runs independently.",
            error: "Failed to start Scrcpy. Ensure it's installed and in your PATH."
        },
        session: {
            stop_error: "Failed to stop session",
            rerun_error: "Rerun failed"
        },
        settings: {
            logo: {
                read_error: "Failed to read logo file. Please try again.",
                select_error: "Failed to select logo"
            },
            feedback: {
                migration_success: "Screens migrated successfully",
                migration_error: "Failed to migrate screens"
            },
            appium: {
                title: "Appium Server",
                status_error: "Failed to get Appium status",
                running: "Running (PID: {{pid}})",
                stopped: "Stopped",
                start: "Start Server",
                start_new_window: "Start in New Window",
                started_new_window: "Appium Server started in new window",
                stop: "Stop Server",
                open_log_terminal: "Open logs in external terminal",
                logs: "Toggle Logs",
                waiting: "Waiting for logs...",
                host: "Host",
                port: "Port"
            },
            paths: {
                title: "Path Configuration",
                select_error: "Failed to select folder",
                migration_title: "Migrate Directory?",
                migration_desc: "Do you want to move the /mapper subdirectory and its files to the new destination?",
                migration_confirm: "Yes, Move",
                migration_destination_not_empty: "The destination already has mapping files. Migration was skipped to avoid overwriting existing data."
            },
            load_error: "Failed to load settings",
            save_error: "Failed to save settings",
            profile_not_found: "Active profile not found!",
            versions_load_error: "Failed to load system versions",
            title: "Settings",
            description: "Configure application preferences and integrations.",
            tools: "Tool Options",
            general: "General",
            recycle_device_views: "Recycle Device Screen",
            recycle_device_views_desc: "Reuse existing tabs when running tests on the same device",
            allow_actions_during_test: "Allow Actions During Test",
            allow_actions_during_test_desc: "Allow specific actions to be performed even while a test is running. (Experimental)",
            language: "Language",
            appearance: {
                title: "Appearance",
                theme: "App Theme",
                light: "Light",
                dark: "Dark",
                primary_color: "Primary Color",
                blue_color: "Blue",
                red_color: "Red",
                green_color: "Green",
                purple_color: "Purple",
                orange_color: "Orange",
                cyan_color: "Cyan",
                pink_color: "Pink",
                custom_color: "Custom",
                custom_color_description: "Select a custom primary color for the application.",
                sidebar_logo: "Sidebar Logo",
                logo_light: "Light Mode",
                logo_dark: "Dark Mode",
                use_default: "Default (Text)",
                logo_hint: "Recommended: PNG, Height 40px, Max Width 200px",
                logo_set: "Custom logo set",
                no_logo: "No logo selected",
                upload_logo: "Upload Logo",
                remove_logo: "Remove Logo",
                zoom: "Interface Zoom",
                zoom_hint: "Use Ctrl/Cmd+ and Ctrl/Cmd- to adjust quickly, or Ctrl/Cmd+0 to reset."
            },
            tool_config: {
                appium_base_path: "Appium Base Path",
                appium_args: "Appium Arguments",
                no_appium_for_robot: "Do not use Appium for Robot Framework",
                custom_adb_path: "Custom ADB Path",
                scrcpy_args: "Scrcpy Arguments",
                robot_args: "Robot Framework Arguments",
                maestro_args: "Maestro Arguments",
                appium_java_args: "Appium Java Arguments",
                cypress_args: "Cypress Arguments",
                selenium_args: "Selenium Arguments",
                app_packages: "App Packages",
                add_package: "Add Package",
                add_package_placeholder: "Add package (Press Enter)",
                ngrok_token: "Ngrok Auth Token"
            },
            adb: {
                restart_success: "ADB Server restarted successfully",
                restart_error: "Failed to restart ADB Server"
            },
            ai: {
                title: "AI Integration",
                provider: "AI Provider",
                key: "API Key",
                model: "Model ID",
                check_models: "Check available models",
                loading_models: "Loading models...",
                models_fetched: "Models fetched",
                models_found_desc: "{{count}} models found. Check the dropdown.",
                no_models_found: "No models found for this key.",
                gemini: {
                    title: "Google Gemini",
                    placeholder: "Enter Gemini API Key",
                    help: "Get your free API Key at"
                },
                claude: {
                    title: "Anthropic Claude",
                    placeholder: "Enter Claude API Key",
                    help: "Get your API Key at"
                },
                openai: {
                    title: "OpenAI ChatGPT",
                    placeholder: "Enter OpenAI API Key",
                    help: "Get your API Key at"
                },
                claude_code: {
                    title: "Claude Code (CLI)",
                    help: "This provider uses the local 'claude' command. No API Key is required as it uses your system's Claude authentication (Team/Enterprise plans).",
                    check_install: "Check Installation",
                    installed: "Claude CLI detected! Version: {{version}}",
                    not_installed: "Claude CLI not found. Please install it using 'npm install -g @anthropic-ai/claude-code'.",
                    token_label: "OAuth Token (Optional)",
                    token_placeholder: "Paste token from 'claude setup-token'",
                    token_help: "If your CLI reports \"Not logged in\", paste the token generated by running 'claude setup-token' in your terminal."
                },
                antigravity: {
                    title: "Antigravity CLI",
                    help: "This provider uses the local 'agy' command. Ensure you have the Antigravity CLI installed and configured.",
                    check_install: "Check Installation",
                    installed: "Antigravity CLI detected! Version: {{version}}",
                    not_installed: "Antigravity CLI not found. Please install it using 'npm install -g @google/antigravity-cli'.",
                    token_label: "API Key",
                    token_placeholder: "Enter Antigravity API Key",
                    token_help: "The API Key will be used to authenticate your requests via the Antigravity CLI."
                },
                max_exploration_steps: "Max Exploration Steps",
                max_exploration_steps_help: "Maximum number of autonomous actions the AI will perform before stopping exploration."
            },
            system: {
                title: "System Versions",
                checking: "Checking versions...",
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
                    ngrok: "Ngrok (Tunnelling)",
                    claude_code: "Claude Code CLI",
                    antigravity: "Antigravity CLI"
                }
            },
            folder_select: "Select Folder",
            dir_label: "{{key}} Directory",
            not_set: "Not set",
            profiles: {
                title: "Configuration Profiles",
                create: "Create Profile",
                rename: "Rename Profile",
                delete: "Delete Profile",
                name_placeholder: "Profile Name",
                confirm_delete: "Are you sure you want to delete this profile? This cannot be undone.",
                default: "Default"
            },
            action: {
                open_file: "Open Settings File",
                restart_adb: "Restart ADB Server"
            },
            path_labels: {
                suites: "Suites Directory",
                tests: "Tests Directory",
                resources: "Resources Directory",
                logs: "Logs Directory",
                logcat: "Logcat Directory",
                screenshots: "Screenshots Directory",
                recordings: "Recordings Directory",
                automationRoot: "Automation Root (Working Dir)",
                mappings: "Mappings Directory"
            },
            tool_options: {
                title: "Tool Options",
                allow_actions_during_test: "Allow actions during test",
                allow_actions_during_test_desc: "Enable Logcat, Performance Monitoring, and other tools even while a test is running"
            },
            integrations: {
                title: "Third-Party Integrations",
                enabled: "Enabled",
                disabled: "Disabled",
                jira: {
                    title: "Jira Software",
                    host: "Jira Cloud Host URL",
                    email: "Atlassian Account Email",
                    token: "API Token",
                    project: "Project Key",
                    connection_success: "Successfully connected to Jira!",
                    connection_failed: "Failed to connect to Jira. Check details.",
                    export_success: "Issue created successfully: {{key}}",
                    export_failed: "Failed to create Jira issue"
                },
                azure: {
                    title: "Azure DevOps",
                    org: "Organization Name",
                    project: "Project Name",
                    pat: "Personal Access Token (PAT)",
                    connection_success: "Successfully connected to Azure DevOps!",
                    connection_failed: "Failed to connect to Azure DevOps. Check details.",
                    export_success: "Work item created successfully: #{{id}}",
                    export_failed: "Failed to create Azure Work Item"
                },
                testlink: {
                    title: "TestLink",
                    url: "XML-RPC Endpoint URL",
                    devkey: "Developer Key (API Key)",
                    projectid: "Project ID (Numerical)",
                    connection_success: "Successfully connected to TestLink!",
                    connection_failed: "Failed to connect to TestLink. Check details.",
                    export_success: "Suite and test cases exported to TestLink!",
                    export_failed: "Failed to export to TestLink"
                },
                git: {
                    title: "Git Integration",
                    enabled: "Enable Git Integration",
                    badges: "Show status badges in File Explorer",
                    status_clean: "Clean",
                    status_modified: "Modified",
                    status_untracked: "Untracked",
                    status_staged: "Staged",
                    stage_all: "Stage All Changes",
                    stage_file: "Stage File",
                    commit: "Commit",
                    commit_msg: "Commit Message",
                    commit_success: "Committed successfully!",
                    push: "Push Changes",
                    push_success: "Pushed successfully!",
                    not_installed: "Git CLI is not installed or not in system PATH."
                },
                webhooks: {
                    title: "Slack & MS Teams Webhooks",
                    slack_url: "Slack Webhook URL",
                    teams_url: "MS Teams Webhook URL",
                    notify_pass: "Notify on Test Pass",
                    notify_fail: "Notify on Test Fail"
                },
                test_connection: "Test Connection",
                testing: "Testing..."
            }
        },
        settings_page: {
            path_auto_updated: "Path automatically updated: {{path}}",
            paths: {
                logs_desc: "Configure the directory where Robot Framework logs are saved to view execution history."
            }
        },
        sidebar: {
            home: "Home",
            description_home: "Overview of connected devices and test activities.",
            dashboard: "QA Dashboard",
            adb_active: "ADB Active",
            appium_active: "Appium Server Active",
            run: "Run",
            description_run: "Device management and automation execution.",
            tests: "Tests",
            description_tests: "Execution history and result analysis.",
            toolbox: "Toolbox",
            description_toolbox: "Everyday tools for debugging and manual testing.",
            ai_assistant: "AI Assistant",
            settings: "Settings",
            description_settings: "Configure application preferences and integrations.",
            about: "About",
            description_about: "Information about Robot Runner and its creators."
        },
        home: {
            maintenance: {
                title: "System Maintenance",
                description: "We are currently performing scheduled maintenance. Some features might be temporarily unavailable."
            },
            update: {
                title: "Update Required",
                description: "A newer version of Robot Runner is available ({{version}}). Please update to ensure compatibility."
            },
            sections: {
                devices: "Connected Devices",
                devices_desc: "Real-time monitoring of active Android devices.",
                activity: "Recent Activity",
                activity_desc: "Overview of your latest test executions and performance."
            },
            device_menu: {
                screenshot: "Take Screenshot",
                toggle_bounds: "Layout Bounds",
                toggle_touches: "Show Taps",
                toggle_pointer: "Pointer Location",
                refresh_info: "Refresh Info",
                reboot: "Reboot Device",
                reboot_success: "Reboot command sent",
                reboot_error: "Failed to reboot",
                bounds_toggled: "Layout bounds toggled",
                touches_toggled: "Show taps toggled",
                pointer_toggled: "Pointer location toggled",
                action_error: "Action failed"
            },
            actions: {
                mirror: "Mirror Screen",
                toolbox: "Open Toolbox",
                all_tests_stopped: "All tests stopped",
                action_error: "Action failed",
                stop_error: "Failed to stop processes"
            },
            server_hub: {
                title: "Server Hub",
                restart_adb: "ADB Server",
                restart_appium: "Appium",
                kill_all: "Kill All Tasks"
            },
            stats: {
                total_runs: "Total Executions",
                executions: "Executions",
                success_rate: "Success Rate",
                last_run: "Last Execution"
            },
            no_devices: "No Devices Found",
            no_devices_desc: "Connect an Android device via USB or Wi-Fi to get started.",
            no_history: "No test history found yet.",
            loading_stats: "Analyzing test history...",
            device_card: {
                battery: "Battery",
                ram: "RAM",
                storage: "Storage"
            }
        },
        startup: {
            loading: "Initializing application...",
            checking: "Checking system tools...",
            critical: {
                title: "Missing Critical Tools",
                description: "The following tools are required to run this application:",
                action: "Exit Application"
            },
            testing: {
                title: "Missing Testing Tools",
                description: "Some tools required for automation are missing:",
                note: "You can still use other features, but running tests will be disabled.",
                action: "Configure in Settings"
            },
            mirroring: {
                title: "Missing Mirroring Tool",
                description: "Scrcpy is required for screen mirroring:",
                note: "Screen mirroring will be disabled.",
                action: "Continue"
            }
        },
        tests: {
            mode: {
                file: "Test File",
                folder: "Folder",
                project: "Project",
                args: "Arguments"
            },
            select_tests: "Select Tests",
            select_args: "Select Arguments",
            selector: {
                title: "Test Case Selection",
                args_title: "Select Arguments",
                all: "Select All",
                none: "Clear All",
                close: "Apply",
                empty: "No items found in this file.",
                loading: "Reading file...",
                selected: "{{count}} items selected",
                info: "Note: If no tests are selected, the entire suite will be executed.",
                suite_info: "If no tests are selected, the entire file will be executed.",
                load_error: "Failed to load items from file"
            },
            selection: {
                title: "Selection",
                items_one: "{{count}} item",
                items_other: "{{count}} items",
                files_one: "{{count}} file",
                files_other: "{{count}} files",
                tests_one: "{{count}} test",
                tests_other: "{{count}} tests",
                folders_one: "{{count}} folder",
                folders_other: "{{count}} folders",
                args_one: "{{count}} arg file",
                args_other: "{{count}} arg files",
                clear_all: "Clear All",
                cleared: "Selection cleared",
                remove: "Remove"
            },
            target: "Target",
            no_selection: "No valid selection",
            run_all: "Run All Tests",
            run_selected: "Run Selected Test",
            tips: {
                appium_maven: "Note: For Appium/Java, the whole project will be executed via Maven."
            },
            status: {
                checking: "Checking Appium...",
                starting: "Starting Appium...",
                launching: "Launching Tests...",
                redirecting: "Redirecting...",
                failed: "Launch failed",
                waiting_server: "Waiting for Server...",
                waiting_server_rest: "Waiting for Appium...",
                server_not_ready: "The Appium server is not ready"
            },
            alerts: {
                busy: "The following devices are currently busy running a test:\n{{devices}}\n\nPlease wait for them to finish.",
                server_not_ready: "The Appium server is not ready",
                missing_paths: "Configuration Required",
                missing_paths_desc: "Both 'Automation Root' and 'Logs Directory' must be configured in Settings to execute tests and generate reports."
            },
            options: {
                dont_overwrite: "Save Logs"
            },
            run_ai: "Run Test with AI",
            run_ai_prompt: "Run Test by AI",
            run_ai_desc: "The AI Agent will execute actions based on the generated BDD steps."
        },
        tests_page: {
            monitoring: "Test Monitoring",
            toolbox: "Device Toolbox",
            history: "History",
            loading: "Loading history...",
            loading_history: "Loading execution history...",
            no_logs: "No execution logs found.",
            report: "Report",
            open_folder: "Open Folder",
            session_not_found: "Session not found.",
            close_tab: "Close Tab",
            load_error: "Failed to load history",
            filter: {
                search: "Search logs...",
                period: "Period",
                group_by: "Group By",
                status: "Status",
                device: "Device",
                suite: "Suite",
                all_time: "All Time",
                none: "None",
                today: "Today",
                last_7_days: "Last 7 Days",
                last_30_days: "Last 30 Days",
                os_version: "OS Version",
                all_devices: "All Devices",
                all_os: "All OS",
                all_status: "All Status"
            },
            actions: {
                analyze_history: "Analyze with AI",
                analyzing: "Analyzing history...",
                ai_analysis_title: "Intelligent History Analysis",
                ai_analysis_rationale_header: "Detailed Historical Insight",
                ai_analysis_error: "Failed to analyze history with AI",
                refresh: "Refresh List",
                clear: "Clear",
                delete: "Delete Log",
                open_launcher: "Open in Launcher"
            },
            unknown_os: "Unknown OS",
            unknown_model: "Unknown Model",
            charts: {
                status_distribution: "Status Distribution",
                group_performance: "Performance by {{group}}",
                select_group: "Select a 'Group By' option to view performance breakdown",
                show: "Show Charts",
                hide: "Hide Charts",
                count_by: "Count by",
                count_by_suites: "Suites (Executions)",
                count_by_tests: "Tests (Volume)",
                duration_avg: "Average Duration"
            }
        },
        toolbox: {
            screenshot: {
                error: "Failed to take screenshot"
            },
            recording: {
                start_error: "Failed to start recording",
                stop_error: "Failed to stop recording"
            },
            scrcpy: {
                open_error: "Failed to open Scrcpy"
            },
            rerun: {
                init_error: "Failed to initiate rerun"
            },
            tabs: {
                console: "Test Console",
                logcat: "Logcat",
                commands: "Commands",
                mirror: "Mirror",
                performance: "Performance",
                apps: "Apps",
                webview: "Webview"
            },
            actions: {
                screenshot: "Take Screenshot",
                start_recording: "Start Screen Recording",
                stop_recording: "Stop Recording",
                stop_execution: "Stop Execution",
                stopping: "Stopping...",
                rerun: "Re-run",
                switch_to_grid: "Switch to Grid View",
                switch_to_tabs: "Switch to Tab View",
                force_stop: "Force Stop"
            }
        },
        updater: {
            version_check_error: "Failed to get app version",
            check_error: "Failed to check for updates"
        },
        onboarding: {
            title: "Welcome to Robot Runner!",
            description: "Let's set up your profile to optimize your experience. This will only take a moment.",
            step1_title: "Select your Language",
            step2_title: "Choose your Usage Mode",
            step2_platform_title: "Select Explorer Platform",
            error_no_mode: "Please select a usage mode to continue.",
            error_no_platform: "Please select a platform to continue.",
            platform: {
                mobile: {
                    title: "Mobile Platform",
                    description: "Everyday tools for debugging and manual testing of mobile apps (ADB, Scrcpy, etc.)."
                },
                web: {
                    title: "Web Platform",
                    description: "Everyday tools for debugging and manual testing of web pages."
                }
            },
            mode: {
                explorer: {
                    title: "Explorer",
                    description: "Everyday tools for debugging and manual testing. No setup required."
                },
                automator: {
                    title: "Automator",
                    description: "Develop and run automated tests using Robot Framework, Appium, Maestro, Cypress, or Selenium."
                }
            },
            step3_title: "Select your Framework",
            error_no_framework: "Please select a framework to continue.",
            framework: {
                robot: {
                    title: "Robot Framework",
                    description: "Python-based framework. Best for high-level mobile/web automation."
                },
                appium: {
                    title: "Appium (Java)",
                    description: "Standard Java/Maven project. Best for specialized native automation."
                },
                maestro: {
                    title: "Maestro",
                    description: "YAML-based flows. Best for ultra-fast UI testing and simplicity."
                },
                cypress: {
                    title: "Cypress",
                    description: "Next-generation front-end testing tool built for the modern web."
                },
                selenium: {
                    title: "Selenium (Pytest)",
                    description: "Standard browser automation using Python & pytest. Best for robust web regression."
                }
            }
        },
        exploration_modal: {
            title: "Autonomous Exploration Configuration",
            subtitle: "Define how the artificial intelligence should navigate and map the application.",
            mode: {
                title: "Exploration Mode",
                new: {
                    title: "Only New Screens",
                    desc: "Exploration will stop when encountering known screens."
                },
                all: {
                    title: "Explore Everything",
                    desc: "Exploration will scan the entire application."
                },
                specific: {
                    title: "Specific Path",
                    desc: "Focus on a specific navigation path."
                }
            },
            limits: {
                title: "Navigation Limits",
                default: {
                    title: "Default Limits",
                    desc: "Loads standard safe configurations."
                },
                custom: {
                    title: "Custom Limits",
                    desc: "Define your own custom keywords."
                }
            },
            fields: {
                blocked: "Blocked Keywords (Buttons forbidden to interact)",
                blocked_placeholder: "delete, remove",
                escape: "Escape Keywords (Back/Cancel buttons)",
                escape_placeholder: "back, cancel",
                priority: "Priority Keywords (What to click first)",
                priority_placeholder: "settings, profile"
            },
            ai: {
                title: "Use AI for Refinement",
                desc: "The AI will add new rules to the configurations above based on your intent.",
                placeholder: "Briefly describe what you want..."
            },
            packages: {
                title: "Target & Allowed Apps",
                target_label: "Target App",
                allowed_label: "Secondary Allowed Apps (App Bundles)",
                allowed_desc: "If exploration opens these apps, it will continue naturally without force-stopping them.",
                no_secondary: "No other packages available in Settings."
            }
        },
        auth: {
            welcome_title: "Welcome to Robot Runner",
            welcome_subtitle: "Please sign in to access all features and cloud synchronization.",
            sign_in_with_google: "Sign in with Google",
            logout: "Sign Out",
            login_success: "Successfully signed in!",
            login_error: "Authentication failed. Please try again.",
            logout_success: "Successfully signed out.",
            logout_error: "Failed to sign out.",
            config_missing: "Cloud features are disabled or missing configuration (Check .env or GitHub Secrets).",
            terms_and_privacy: "By signing in, you agree to our Terms of Service and Privacy Policy."
        }
    }
};
