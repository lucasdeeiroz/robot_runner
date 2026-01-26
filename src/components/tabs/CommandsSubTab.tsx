import { useState, useEffect, useRef } from "react";
import { Terminal, Send, Trash2, Power, Wifi, Smartphone, Battery, Save, Star, X, Square } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Modal } from "@/components/organisms/Modal";
import { feedback } from "@/lib/feedback";
import { Section } from "@/components/organisms/Section";
import { Button } from "@/components/atoms/Button";

interface CommandsSubTabProps {
    selectedDevice: string;
}

interface SavedCommand {
    id: string;
    label: string;
    cmd: string;
}

export function CommandsSubTab({ selectedDevice }: CommandsSubTabProps) {
    const { t } = useTranslation();
    const [command, setCommand] = useState("");
    const [history, setHistory] = useState<string[]>([]);
    const [isExecuting, setIsExecuting] = useState(false);
    const [savedCommands, setSavedCommands] = useState<SavedCommand[]>([]);
    const [currentCmdId, setCurrentCmdId] = useState<string | null>(null);

    // Save Command Modal State
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [saveLabel, setSaveLabel] = useState("");



    // Listeners ref
    const listenersRef = useRef<UnlistenFn[]>([]);

    // Cleanup listeners on unmount
    useEffect(() => {
        return () => {
            listenersRef.current.forEach(unlisten => unlisten());
            listenersRef.current = [];
        };
    }, []);

    // Load saved commands
    useEffect(() => {
        const saved = localStorage.getItem("saved_commands");
        if (saved) {
            try {
                setSavedCommands(JSON.parse(saved));
            } catch (e) {
                feedback.toast.error("commands.parse_error", e);
            }
        }
    }, []);

    const openSaveModal = () => {
        if (!command.trim()) return;
        setSaveLabel(command.length > 20 ? command.substring(0, 20) + "..." : command);
        setIsSaveModalOpen(true);
    };

    const confirmSaveCommand = () => {
        if (!saveLabel.trim()) return;

        const newCmd: SavedCommand = {
            id: Date.now().toString(),
            label: saveLabel,
            cmd: command
        };

        const updated = [...savedCommands, newCmd];
        setSavedCommands(updated);
        localStorage.setItem("saved_commands", JSON.stringify(updated));

        setIsSaveModalOpen(false);
        setSaveLabel("");
    };

    const deleteSavedCommand = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(t('commands.actions.delete_confirm'))) return;
        const updated = savedCommands.filter(c => c.id !== id);
        setSavedCommands(updated);
        localStorage.setItem("saved_commands", JSON.stringify(updated));
    };


    const executeCommand = async (cmdStr: string, label?: string) => {
        // Generate ID
        const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        setCurrentCmdId(cmdId);
        setIsExecuting(true);
        setHistory(prev => [...prev, `> ${label || cmdStr}`]);

        try {
            // Setup listeners
            const unlistenOutput = await listen<string>(`cmd-output-${cmdId}`, (event) => {
                setHistory(prev => [...prev, event.payload]);
            });
            const unlistenClose = await listen<string>(`cmd-close-${cmdId}`, (event) => {
                setHistory(prev => [...prev, `[Process exited: ${event.payload}]`]);
                setIsExecuting(false);
                setCurrentCmdId(null);
                // remove listeners
                listenersRef.current = listenersRef.current.filter(Fn => Fn !== unlistenOutput && Fn !== unlistenClose);
                unlistenOutput();
                unlistenClose();
            });

            listenersRef.current.push(unlistenOutput, unlistenClose);

            await invoke("start_adb_command", {
                id: cmdId,
                device: selectedDevice,
                command: cmdStr
            });

        } catch (e) {
            setHistory(prev => [...prev, `Error: ${e}`]);
            setIsExecuting(false);
            setCurrentCmdId(null);
        }
    };

    const handleCancel = async () => {
        if (currentCmdId) {
            try {
                await invoke('stop_adb_command', { id: currentCmdId });
                setHistory(prev => [...prev, "^ Cancelled by user"]);
            } catch (e) {
                feedback.toast.error("commands.cancel_error", e);
            }
        }
    };

    const handleSend = () => {
        if (!command.trim()) return;
        executeCommand(command);
        setCommand("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isExecuting) { // Prevent enter if executing
            handleSend();
        }
    };

    const quickActions = [
        { label: t('commands.actions.ip_address'), icon: <Wifi size={14} />, cmd: "shell ip addr show wlan0 | grep inet" },
        { label: t('commands.actions.list_packages'), icon: <Smartphone size={14} />, cmd: "shell pm list packages -3" },
        { label: t('commands.actions.battery'), icon: <Battery size={14} />, cmd: "shell dumpsys battery" },
        { label: t('commands.actions.reboot'), icon: <Power size={14} />, cmd: "reboot" },
    ];

    if (!selectedDevice) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-on-surface/80">
                <Terminal size={48} className="mb-4 opacity-20" />
                <p>{t('commands.empty')}</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-2 overflow-y-auto">
            <Section
                title={t('commands.title', 'ADB Commands')}
                icon={Terminal}
                variant="transparent"
                className="pb-2 mb-2 p-2"
                status={
                    <div className="text-xs text-on-surface/80">
                        {selectedDevice}
                    </div>
                }
                // menus={!isNarrow ? null : null} // Placeholder removed

                actions={
                    <button
                        onClick={() => setHistory([])}
                        className="p-1 hover:text-error transition-colors"
                        title={t('commands.clear')}
                    >
                        <Trash2 size={16} />
                    </button>
                }
            />

            {/* Console Output */}
            <div className="flex-1 bg-surface text-on-surface/50 font-mono text-xs rounded-lg border border-outline-variant/30 p-4 overflow-y-auto on-primaryspace-pre-wrap">
                {history.length === 0 && <span className="opacity-30">{t('commands.waiting')}</span>}
                {history.map((line, i) => (
                    <div key={i} className="text-on-surface/80 on-primaryspace-pre-wrap break-all">
                        {line.startsWith('>') ? <span className="text-primary font-bold">{line}</span> : line}
                    </div>
                ))}
            </div>

            {/* Actions Area */}
            <div className="space-y-2 p-2">
                {/* Quick Actions */}
                <div className="flex gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-on-surface/80 self-center mr-2">{t('commands.quick')}:</span>
                    {quickActions.map(action => (
                        <button
                            key={action.label}
                            onClick={() => executeCommand(action.cmd, action.label)}
                            disabled={isExecuting}
                            className="flex items-center gap-2 px-3 py-1.5 bg-surface-variant/30 hover:bg-outline-variant rounded-md text-xs font-medium transition-colors border border-outline-variant/30 disabled:opacity-50"
                        >
                            {action.icon}
                            {action.label}
                        </button>
                    ))}
                </div>

                {/* Saved Commands */}
                {savedCommands.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-warning/80 self-center mr-2">{t('commands.saved')}:</span>
                        {savedCommands.map(saved => (
                            <div
                                key={saved.id}
                                className="group flex items-center gap-1 bg-warning-container/50 border border-warning/20 rounded-md px-1 pr-2 overflow-hidden"
                            >
                                <button
                                    onClick={() => setCommand(saved.cmd)} // Fill input
                                    className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-on-warning-container hover:text-on-warning-container/50 transition-colors"
                                    title={saved.cmd}
                                >
                                    <Star size={12} className="fill-warning/40 text-warning-container/60" />
                                    {saved.label}
                                </button>
                                <button
                                    onClick={(e) => deleteSavedCommand(saved.id, e)}
                                    className="p-1 text-warning/80 hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>


            {/* Input Line */}
            <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 bg-surface p-2 border-t border-outline-variant/30 rounded-lg">
                    <Terminal size={18} className="text-on-surface-variant/80" />
                    <input
                        type="text"
                        value={command}
                        onChange={e => setCommand(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('commands.input_placeholder', "Enter command...")}
                        className="flex-1 bg-transparent border-none outline-none text-sm text-on-surface/80 font-mono placeholder:text-on-surface-variant/80/50"
                        autoComplete="off"
                        disabled={isExecuting}
                    />
                </div>

                <button
                    onClick={openSaveModal}
                    disabled={!command.trim() || isExecuting}
                    className="px-3 bg-surface-variant/30 hover:bg-outline-variant text-on-surface-variant/80 rounded-lg transition-colors border border-outline-variant/30 disabled:opacity-50"
                    title={t('commands.actions.save')}
                >
                    <Save size={18} />
                </button>

                {isExecuting ? (
                    <Button
                        onClick={handleCancel}
                        variant="danger"
                        title="Cancel Command"
                    >
                        <Square size={18} fill="currentColor" />
                    </Button>
                ) : (
                    <Button
                        onClick={handleSend}
                        disabled={!command.trim()}
                        variant="primary"
                    >
                        <Send size={18} />
                    </Button>
                )}
            </div>

            {/* Save Command Modal */}
            <Modal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                title={t('commands.modal.title')}
            >
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant/80 mb-1">
                            {t('commands.modal.label')}
                        </label>
                        <input
                            type="text"
                            value={saveLabel}
                            onChange={(e) => setSaveLabel(e.target.value)}
                            placeholder={t('commands.modal.placeholder')}
                            className="w-full px-3 py-2 bg-on-primary border border-outline-variant/30 rounded-lg focus:ring-2 focus:ring-primary outline-none"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-on-surface-variant/80 mb-1">
                            {t('commands.modal.command')}
                        </label>
                        <div className="px-3 py-2 bg-surface-variant/30 rounded-lg font-mono text-sm text-on-surface-variant/80 break-all border border-outline-variant">
                            {command}
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            onClick={() => setIsSaveModalOpen(false)}
                            className="px-4 py-2 text-sm font-medium text-on-surface-variant/80 hover:bg-surface-variant/30 rounded-lg transition-colors"
                        >
                            {t('commands.modal.cancel')}
                        </button>
                        <button
                            onClick={confirmSaveCommand}
                            disabled={!saveLabel.trim()}
                            className="px-4 py-2 text-sm font-medium bg-primary text-on-primary hover:opacity-90 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {t('commands.modal.save')}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
