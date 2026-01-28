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
        success: 'bg-success/10 text-success',
        warning: 'bg-warning/10 text-warning',
        error: 'bg-error/10 text-error',
        neutral: 'bg-surface-variant/10 text-on-surface/80',
        transparent: 'bg-transparent text-on-surface-variant/80',
    };

    return (
        <div className={twMerge(
            'rounded-2xl flex items-center justify-center shrink-0',
            sizes[size],
            variants[variant],
            className
        )}>
            <Icon size={iconSizes[size]} strokeWidth={2} />
        </div>
    );
};
