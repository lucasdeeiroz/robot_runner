import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                ref={overlayRef}
                className={clsx(
                    "bg-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-outline-variant/30 animate-in zoom-in-95 duration-200",
                    className
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-outline-variant/30 shrink-0">
                    <h2 className="text-lg font-semibold text-on-surface/80">{title}</h2>
                    <button
                        onClick={onClose}
                        className="p-1 text-on-surface/80 hover:text-on-surface-variant/80 hover:bg-surface-variant/30 rounded-md transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 min-h-0">
                    {children}
                </div>
            </div>
        </div>,
        document.body
    );
}
