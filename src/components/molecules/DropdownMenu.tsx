
import { Menu, Transition } from '@headlessui/react';
import { Fragment, ReactNode } from 'react';
import clsx from 'clsx';

export interface DropdownMenuItem {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    variant?: 'default' | 'danger' | 'warning';
    disabled?: boolean;
}

interface DropdownMenuProps {
    trigger: ReactNode;
    items: DropdownMenuItem[];
    align?: 'left' | 'right';
}

export function DropdownMenu({ trigger, items, align = 'right' }: DropdownMenuProps) {
    return (
        <Menu as="div" className="relative inline-block text-left">
            <div>
                <Menu.Button as={Fragment}>
                    {trigger}
                </Menu.Button>
            </div>

            <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
            >
                <Menu.Items 
                    anchor={align === 'right' ? "bottom end" : "bottom start"}
                    className="z-50 mt-2 w-56 origin-top-right rounded-2xl bg-surface border border-outline-variant/30 shadow-xl focus:outline-none overflow-hidden p-1.5 [--anchor-gap:8px]"
                >
                    {items.map((item, index) => (
                            <Menu.Item key={index} disabled={item.disabled}>
                                {({ active, disabled }) => (
                                    <button
                                        onClick={item.onClick}
                                        disabled={disabled}
                                        className={clsx(
                                            "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                                            active ? (
                                                item.variant === 'danger' ? "bg-error/10 text-error" : 
                                                item.variant === 'warning' ? "bg-warning/10 text-warning" :
                                                "bg-primary/10 text-primary"
                                            ) : (
                                                item.variant === 'danger' ? "text-error/80" :
                                                item.variant === 'warning' ? "text-warning/80" :
                                                "text-on-surface/80"
                                            ),
                                            disabled && "opacity-30 cursor-not-allowed"
                                        )}
                                    >
                                        <div className={clsx(
                                            "flex items-center justify-center transition-colors",
                                            active ? "text-current" : "text-on-surface-variant/50"
                                        )}>
                                            {item.icon}
                                        </div>
                                        <span className="font-medium">{item.label}</span>
                                    </button>
                                )}
                            </Menu.Item>
                        ))}
                </Menu.Items>
            </Transition>
        </Menu>
    );
}
