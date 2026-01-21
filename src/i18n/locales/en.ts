export const en = {
    translation: {
        about: {
            description: "Information about Robot Runner and its creators.",
            long_description: "A modern, cross-platform GUI for Robot Framework and Appium, designed to simplify test automation workflows.",
            developed_by: "Developed by",
            lead: "Principal Developer",
            collaborator: "Collaborating Developer",
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
                tailwind: { name: "TailwindCSS", desc: "Utility-first CSS framework for rapid and consistent styling." },
                lucide: { name: "Lucide", desc: "Beautiful and consistent vector icon library." }
            },
            legal_title: "Terms & License",
            license: "MIT License",
            license_desc: "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.",
            disclaimer: "The software is provided 'as is', without warranty of any kind, express or implied.",
            update_check: "Check for Updates",
            update_available: "New version available: {{version}}",
            update_not_available: "You are up to date",
            update_error: "Failed to check for updates",
            checking: "Checking...",
            update_badge: "UPDATE"
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
                refresh: "Refresh List"
            },
            search_placeholder: "Search packages...",
            toggle_system: "Toggle System Apps",
            no_device: "No device selected",
            no_packages: "No packages found",
            status: {
                installing: "Installing APK...",
                disabled_badge: "Disabled"
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
            placeholder: "Enter ADB command (e.g. 'shell ls -la')",
            waiting: "Waiting for commands...",
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
            cancel: "Cancel",
            save: "Save",
            error_occurred: "An error occurred: {{error}}",
            delete: "Delete",
            edit: "Edit",
            ok: "OK",
            search: "Search...",
            loading: "Loading...",
            minimize: "Minimize",
            maximize: "Maximize",
            close: "Close",
            confirm: "Confirm",
            attention: "Attention",
            errors: {
                open_file_failed: "Failed to open file or folder",
                open_link_failed: "Failed to open link"
            }
        },
        components: {
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
                pair: "Pair",
                disconnect: "Disconnect",
                start_tunnel: "Start Public Tunnel",
                stop_tunnel: "Stop Tunnel",
                copy: "Copied!",
                paste_url: "Paste URL",
                disconnect_all: "Disconnect All",
                rerun_failed: "Re-run Failed Tests"
            },
            status: {
                tunnel_active: "Tunnel Active",
                starting_ngrok: "Starting Ngrok Tunnel...",
                pasted: "Pasted from clipboard",
                clipboard_invalid: "Invalid format in clipboard",
                clipboard_error: "Clipboard permission denied",
                auto_ip: "Auto-detected IP: {{ip}}",
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
                cancel_card: "Cancel"
            }
        },
        console: {
            waiting: "Waiting for output..."
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
            select_generic: "Select"
        },
        inspector: {
            title: "Inspector",
            update_error: "Failed to update inspector",
            input_error: "Failed to send input",
            empty: "Select a device to start Inspector",
            refresh: "Refresh Source",
            modes: {
                inspect: "Inspect Mode",
                tap: "Tap Mode",
                swipe: "Swipe Mode"
            },
            status: {
                fetching: "Fetching device state...",
                ready: "Ready",
                loading: "Loading...",
                no_screenshot: "No screenshot"
            },
            properties: "Node Properties",
            select_element: "Select an element on the screenshot",
            attributes: {
                all: "All Attributes",
                xpath: "XPath",
                resource_id: "Resource ID",
                access_id: "Access ID",
                class: "Class",
                identifiers: "Identifiers",
                hierarchy: "Hierarchy"
            },
            clear_selection: "Clear Selection",
            nav: {
                home: "Home",
                back: "Back",
                recents: "Recents"
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
            select_device: "Select a device to view logs"
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
            select_device: "Select a device to view performance stats.",
            system_only: "Entire System",
            device_stats: "Device Performance",
            app_stats: "App Performance",
            auto: "Auto",
            na: "N/A"
        },
        run_tab: {
            launcher: "Launcher",
            connect: "Connect",
            inspector: "Inspector",
            commands: "Commands",
            device: {
                no_device: "No Device Selected",
                selected_count: "{{count}} Devices Selected",
                select: "Select Devices",
                busy: "Busy",
                refresh: "Refresh Devices"
            },
            console: {
                running: "RUNNING",
                pass: "PASS",
                fail: "FAIL",
                test_summary: "{{total}} TESTS: {{passed}} PASSED, {{failed}} FAILED",
                waiting: "Waiting for logs..."
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
            appium: {
                title: "Appium Server",
                status_error: "Failed to get Appium status",
                running: "Running (PID: {{pid}})",
                stopped: "Stopped",
                start: "Start Server",
                stop: "Stop Server",
                logs: "Toggle Logs",
                waiting: "Waiting for logs...",
                host: "Host",
                port: "Port"
            },
            paths: {
                title: "Path Configuration",
                select_error: "Failed to select folder"
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
            language: "Language",
            appearance: {
                title: "Appearance",
                theme: "App Theme",
                light: "Light",
                dark: "Dark",
                primary_color: "Primary Color",
                sidebar_logo: "Sidebar Logo",
                logo_light: "Light Mode Logo",
                logo_dark: "Dark Mode Logo",
                use_default: "Default (Text)",
                logo_hint: "Recommended: PNG, Height 40px, Max Width 200px"
            },
            tool_config: {
                appium_args: "Appium Arguments",
                scrcpy_args: "Scrcpy Arguments",
                robot_args: "Robot Framework Arguments",
                app_packages: "App Packages",
                add_package: "Add Package",
                add_package_placeholder: "Add package (Press Enter)",
                ngrok_token: "Ngrok Auth Token"
            },
            ai: {
                title: "AI Integration (Google Gemini)",
                key: "API Key",
                placeholder: "Enter your Gemini API Key"
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
                    scrcpy: "Scrcpy",
                    ngrok: "Ngrok (Tunnelling)"
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
            path_labels: {
                suites: "Suites Directory",
                tests: "Tests Directory",
                resources: "Resources Directory",
                logs: "Logs Directory",
                logcat: "Logcat Directory",
                screenshots: "Screenshots Directory",
                recordings: "Recordings Directory",
                automationRoot: "Automation Root (Working Dir)"
            }
        },
        sidebar: {
            run: "Run",
            description_run: "Device management and automation execution.",
            tests: "Tests",
            description_tests: "Execution history and result analysis.",
            ai_assistant: "AI Assistant",
            settings: "Settings",
            description_settings: "Configure application preferences and integrations.",
            about: "About",
            description_about: "Information about Robot Runner and its creators."
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
                folder: "Test Folder",
                args: "Argument File"
            },
            target: "Target",
            no_selection: "No valid selection",
            run_all: "Run All Tests",
            run_selected: "Run Selected Test",
            status: {
                checking: "Checking Appium...",
                starting: "Starting Appium...",
                launching: "Launching Tests...",
                redirecting: "Redirecting...",
                failed: "Launch failed",
                waiting_server: "Waiting for Server...",
                server_not_ready: "The Appium server is not ready"
            },
            alerts: {
                busy: "The following devices are currently busy running a test:\n{{devices}}\n\nPlease wait for them to finish.",
                server_not_ready: "The Appium server is not ready"
            },
            options: {
                dont_overwrite: "Don't Overwrite Logs"
            }
        },
        tests_page: {
            monitoring: "Test Monitoring",
            toolbox: "Device Toolbox",
            history: "History",
            loading: "Loading history...",
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
                today: "Today",
                last_7_days: "Last 7 Days",
                last_30_days: "Last 30 Days",
                os_version: "OS Version"
            },
            actions: {
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
                hide: "Hide Charts"
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
                apps: "Apps"
            },
            actions: {
                screenshot: "Take Screenshot",
                start_recording: "Start Screen Recording",
                stop_recording: "Stop Recording",
                stop_execution: "Stop Execution",
                rerun: "Re-run",
                switch_to_grid: "Switch to Grid View",
                switch_to_tabs: "Switch to Tab View",
                force_stop: "Force Stop"
            }
        },
        updater: {
            version_check_error: "Failed to get app version",
            check_error: "Failed to check for updates"
        }
    }
};
