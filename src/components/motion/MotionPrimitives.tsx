import { motion, HTMLMotionProps, Variants } from 'framer-motion';
import { ReactNode } from 'react';

// Material Design 3 Standard Easing
const EASING = {
    standard: [0.2, 0.0, 0, 1.0] as const, // Emphasized
    standardDecelerate: [0, 0, 0.2, 1] as const,
    standardAccelerate: [0.4, 0, 1, 1] as const,
};

interface MotionProps extends HTMLMotionProps<"div"> {
    children: ReactNode;
    className?: string;
    delay?: number;
    duration?: number;
}

export const FadeIn = ({ children, className, delay = 0, duration = 0.3, ...props }: MotionProps) => (
    <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration, delay, ease: EASING.standard }}
        className={className}
        {...props}
    >
        {children}
    </motion.div>
);

export const ScaleIn = ({ children, className, delay = 0, duration = 0.3, ...props }: MotionProps) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration, delay, ease: EASING.standard }}
        className={className}
        {...props}
    >
        {children}
    </motion.div>
);

interface SlideInProps extends MotionProps {
    direction?: 'left' | 'right' | 'up' | 'down';
}

export const SlideIn = ({ children, className, delay = 0, duration = 0.3, direction = 'up', ...props }: SlideInProps) => {
    const variants: Variants = {
        hidden: {
            opacity: 0,
            x: direction === 'left' ? -20 : direction === 'right' ? 20 : 0,
            y: direction === 'up' ? 20 : direction === 'down' ? -20 : 0,
        },
        visible: {
            opacity: 1,
            x: 0,
            y: 0,
        },
        exit: {
            opacity: 0,
            x: direction === 'left' ? -20 : direction === 'right' ? 20 : 0,
            y: direction === 'up' ? 20 : direction === 'down' ? -20 : 0,
        },
    };

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={variants}
            transition={{ duration, delay, ease: EASING.standard }}
            className={className}
            {...props}
        >
            {children}
        </motion.div>
    );
};

export const StaggerContainer = ({ children, className, delay = 0, staggerChildren = 0.05, ...props }: MotionProps & { staggerChildren?: number }) => (
    <motion.div
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={{
            hidden: {
                opacity: 0,
                y: -10,
                scale: 0.95,
                transition: { duration: 0.2, ease: EASING.standard }
            },
            visible: {
                opacity: 1,
                y: 0,
                scale: 1,
                transition: {
                    type: "spring",
                    duration: 0.4,
                    bounce: 0,
                    staggerChildren,
                    delayChildren: delay,
                },
            },
        }}
        className={className}
        {...props}
    >
        {children}
    </motion.div>
);

export const StaggerItem = ({ children, className, ...props }: MotionProps) => (
    <motion.div
        variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
        }}
        transition={{ duration: 0.3, ease: EASING.standard }}
        className={className}
        {...props}
    >
        {children}
    </motion.div>
);
