import { motion } from "framer-motion";

export const ExpressiveLoading = ({ size = "md", className, variant = "linear" }: { size?: "xsm" | "sm" | "md" | "lg", className?: string, variant?: "linear" | "circular" }) => {

    const strokeWidthMap = {
        xsm: "2",
        sm: "3",
        md: "4",
        lg: "5"
    };

    if (variant === 'circular') {
        const sizePx = {
            xsm: "w-4 h-4",
            sm: "w-6 h-6",
            md: "w-10 h-10",
            lg: "w-16 h-16"
        };

        // Generate Wavy Circle Path
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
        d += " Z";

        return (
            <div className={`flex items-center justify-center ${sizePx[size]} ${className || ''} text-primary`}>
                <motion.svg
                    viewBox="0 0 48 48"
                    className="w-full h-full overflow-visible"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                >
                    {/* Background Track */}
                    <path
                        d={d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={strokeWidthMap[size]}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="opacity-20"
                    />

                    {/* The "Snake" Scanner */}
                    <motion.path
                        d={d}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={strokeWidthMap[size]}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0.1, pathOffset: 0 }}
                        animate={{
                            pathLength: [0.1, 0.4, 0.1],
                            pathOffset: [0, 1]
                        }}
                        transition={{
                            pathLength: {
                                duration: 2,
                                repeat: Infinity,
                                ease: "easeInOut",
                                repeatType: "reverse"
                            },
                            pathOffset: {
                                duration: 2.5,
                                repeat: Infinity,
                                ease: "linear"
                            }
                        }}
                    />
                </motion.svg>
            </div>
        );
    }

    // Linear Wavy Path Data (Sine Wave)
    // M 0 10: Start middle-left
    // Q 12.5 0 25 10: Quadratic Bezier to create first half-wave (up)
    // T 50 10: Smooth Quadratic Bezier to create second half-wave (down)
    // Repeated to ensure enough length for the "snake" to travel
    const pathData = "M 0 10 Q 12.5 2 25 10 T 50 10 T 75 10 T 100 10 T 125 10 T 150 10 T 175 10 T 200 10";

    const heightMap = {
        xsm: "h-2",
        sm: "h-3",
        md: "h-5", // Default
        lg: "h-8"
    };

    return (
        <div className={`flex items-center justify-center ${heightMap[size]} ${className || ''} text-primary`}>
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
                <motion.path
                    d={pathData}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidthMap[size]}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0, pathOffset: 0 }}
                    animate={{
                        pathLength: [0.15, 0.3, 0.15],
                        pathOffset: [0, 1]
                    }}
                    transition={{
                        pathLength: {
                            duration: 1.5,
                            repeat: Infinity,
                            ease: "easeInOut",
                            repeatType: "reverse"
                        },
                        pathOffset: {
                            duration: 2,
                            repeat: Infinity,
                            ease: "linear"
                        }
                    }}
                />
            </svg>
        </div>
    );
};
