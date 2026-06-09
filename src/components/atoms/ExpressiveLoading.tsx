import { useMemo, memo } from "react";

const ExpressiveLoadingComponent = ({ size = "md", className, variant = "linear" }: { size?: "xsm" | "sm" | "md" | "lg", className?: string, variant?: "linear" | "circular" | "skeleton" }) => {

    const strokeWidthMap = {
        xsm: "2",
        sm: "3",
        md: "4",
        lg: "5"
    };

    if (variant === 'skeleton') {
        const skeletonClass = {
            xsm: "h-3 rounded-md",
            sm: "h-5 rounded-lg",
            md: "h-8 rounded-xl",
            lg: "h-12 rounded-2xl"
        };
        return (
            <div className={`relative overflow-hidden bg-surface-variant/20 ${skeletonClass[size]} ${className || ''}`}>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] animate-[shimmer_1.6s_infinite] dark:via-white/10" />
            </div>
        );
    }

    // Memoize circular path calculation
    const circularPath = useMemo(() => {
        if (variant !== 'circular') return "";
        const radius = 20;
        const amplitude = 2.5;
        const lobes = 8;
        const points = 100;

        let d = "";
        for (let i = 0; i <= points; i++) {
            const angle = (i / points) * Math.PI * 2;
            const r = radius + amplitude * Math.sin(lobes * angle);
            const x = 24 + r * Math.cos(angle);
            const y = 24 + r * Math.sin(angle);
            d += (i === 0 ? "M " : "L ") + x.toFixed(2) + " " + y.toFixed(2);
        }
        return d + " Z";
    }, [variant]);

    if (variant === 'circular') {
        const sizePx = {
            xsm: "w-4 h-4",
            sm: "w-6 h-6",
            md: "w-10 h-10",
            lg: "w-16 h-16"
        };

        return (
            <div 
                className={`flex items-center justify-center ${sizePx[size]} ${className || ''} text-primary dark:text-primary/80`}
                style={{ willChange: 'transform' }}
            >
                <svg
                    viewBox="0 0 48 48"
                    className="w-full h-full overflow-visible"
                    style={{
                        animation: 'expressive-spin 1.5s linear infinite',
                        transformOrigin: 'center'
                    }}
                >
                    {/* Background Track */}
                    <path
                        d={circularPath}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={strokeWidthMap[size]}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="opacity-20"
                    />

                    {/* The "Snake" Scanner */}
                    <path
                        d={circularPath}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={strokeWidthMap[size]}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="30 120"
                        style={{
                            animation: 'expressive-dash 1.5s linear infinite'
                        }}
                    />
                </svg>
            </div>
        );
    }

    // Linear Wavy Path Data (Sine Wave)
    const pathData = "M 0 10 Q 12.5 2 25 10 T 50 10 T 75 10 T 100 10 T 125 10 T 150 10 T 175 10 T 200 10";

    const heightMap = {
        xsm: "h-2",
        sm: "h-3",
        md: "h-5", // Default
        lg: "h-8"
    };

    return (
        <div 
            className={`flex items-center justify-center ${heightMap[size]} ${className || ''} text-primary dark:text-primary/80`}
            style={{ willChange: 'transform' }}
        >
            <svg
                viewBox="0 0 100 20"
                className="w-full h-full overflow-visible"
                preserveAspectRatio="none"
            >
                {/* Background Track (The path itself) */}
                <path
                    d={pathData}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidthMap[size]}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-20"
                />

                {/* The "Snake" (Indicator) */}
                <path
                    d={pathData}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidthMap[size]}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="30 170"
                    style={{
                        animation: 'expressive-linear-dash 1.5s linear infinite'
                    }}
                />
            </svg>
        </div>
    );
};

export const ExpressiveLoading = memo(ExpressiveLoadingComponent);

