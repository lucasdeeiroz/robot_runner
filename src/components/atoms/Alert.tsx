import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

const alertVariants = cva(
    "relative w-full rounded-2xl border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground",
    {
        variants: {
            variant: {
                default: "bg-surface-variant/30 text-on-surface/80 border-outline-variant",
                destructive: "border-error/30 text-error/80 bg-error-container/30 [&>svg]:text-error/80",
                success: "border-success/30 text-success/80 bg-transparent [&>svg]:text-success/80",
                warning: "border-warning/30 text-on-warning-container/80 bg-warning-container/30 [&>svg]:text-on-warning-container/80",
                info: "border-info/30 text-info/80 bg-info-container/30 [&>svg]:text-info/80",
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
                {title && <h5 className="font-medium leading-none tracking-tight">{title}</h5>}
                <div className="text-sm opacity-90 break-words on-primaryspace-pre-wrap">{children}</div>
            </div>
        </div>
    );
}
