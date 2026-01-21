import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

const alertVariants = cva(
    "relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
    {
        variants: {
            variant: {
                default: "bg-zinc-100 text-zinc-900 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-700",
                destructive: "border-red-500/50 text-red-700 dark:border-red-500 [&>svg]:text-red-600 dark:bg-red-900/10 dark:text-red-400",
                success: "border-green-500/50 text-green-700 dark:border-green-500 [&>svg]:text-green-600 dark:bg-green-900/10 dark:text-green-400",
                warning: "border-yellow-500/50 text-yellow-700 dark:border-yellow-500 [&>svg]:text-yellow-600 dark:bg-yellow-900/10 dark:text-yellow-400",
                info: "border-blue-500/50 text-blue-700 dark:border-blue-500 [&>svg]:text-blue-600 dark:bg-blue-900/10 dark:text-blue-400",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
);

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
    icon?: React.ReactNode;
    title?: string;
}

export function Alert({ className, variant, icon, title, children, ...props }: AlertProps) {
    const Icon = icon ? (
        <span className="h-4 w-4">{icon}</span>
    ) : variant === 'destructive' ? (
        <XCircle className="h-4 w-4" />
    ) : variant === 'success' ? (
        <CheckCircle2 className="h-4 w-4" />
    ) : variant === 'warning' ? (
        <AlertCircle className="h-4 w-4" />
    ) : (
        <Info className="h-4 w-4" />
    );

    return (
        <div role="alert" className={twMerge(alertVariants({ variant }), className)} {...props}>
            {Icon}
            <div className="flex flex-col gap-1">
                {title && <h5 className="mb-1 font-medium leading-none tracking-tight">{title}</h5>}
                <div className="text-sm opacity-90 break-words whitespace-pre-wrap">{children}</div>
            </div>
        </div>
    );
}
