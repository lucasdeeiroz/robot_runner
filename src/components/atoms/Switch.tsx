import clsx from "clsx";

interface SwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    className?: string;
    disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, className, disabled }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={(e) => {
                if (disabled) return;
                e.stopPropagation();
                onCheckedChange(!checked);
            }}
            className={clsx(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-2xl border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ring-offset-background",
                checked ? "bg-primary" : "bg-outline-variant",
                disabled && "opacity-50 cursor-not-allowed",
                className
            )}
        >
            <span
                className={clsx(
                    "pointer-events-none block h-5 w-5 rounded-full bg-surface shadow-lg ring-0 transition-transform",
                    checked ? "translate-x-5" : "translate-x-0"
                )}
            />
        </button>
    );
}
