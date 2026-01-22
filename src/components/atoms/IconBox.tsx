import { LucideIcon } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

interface IconBoxProps {
    icon: LucideIcon;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    variant?: 'primary' | 'success' | 'warning' | 'error' | 'neutral' | 'transparent';
    className?: string;
}

export const IconBox = ({ icon: Icon, size = 'md', variant = 'primary', className }: IconBoxProps) => {
    const sizes = {
        sm: 'w-6 h-6 p-1',
        md: 'w-8 h-8 p-1.5',
        lg: 'w-10 h-10 p-2',
        xl: 'w-[52px] h-[52px] p-2.5 rounded-2xl',
    };

    const iconSizes = {
        sm: 14,
        md: 18,
        lg: 20,
        xl: 32,
    };

    const variants = {
        primary: 'bg-primary/10 text-primary',
        success: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
        warning: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
        error: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
        neutral: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
        transparent: 'bg-transparent text-zinc-500 dark:text-zinc-400',
    };

    return (
        <div className={twMerge(
            'rounded-lg flex items-center justify-center shrink-0',
            sizes[size],
            variants[variant],
            className
        )}>
            <Icon size={iconSizes[size]} strokeWidth={2} />
        </div>
    );
};
