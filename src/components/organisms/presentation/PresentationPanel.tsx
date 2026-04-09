import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ChevronLeft, RotateCcw, Play, X } from 'lucide-react';
import { useSettings } from "@/lib/settings";
import { feedback } from '@/lib/feedback';
import { SLIDES_DATA } from './slidesData';

export function PresentationPanel() {
    const { t } = useTranslation();
    const { updateSetting } = useSettings();
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [activePointsCount, setActivePointsCount] = useState(0);

    const currentSlide = useMemo(() => SLIDES_DATA[currentSlideIndex], [currentSlideIndex]);
    const maxPoints = currentSlide.pointsKeys.length;

    const handleNext = useCallback(() => {
        if (activePointsCount < maxPoints) {
            setActivePointsCount(prev => prev + 1);
        } else if (currentSlideIndex < SLIDES_DATA.length - 1) {
            setCurrentSlideIndex(prev => prev + 1);
            setActivePointsCount(0);
        }
    }, [activePointsCount, maxPoints, currentSlideIndex]);

    const handleBack = useCallback(() => {
        if (activePointsCount > 0) {
            setActivePointsCount(prev => prev - 1);
        } else if (currentSlideIndex > 0) {
            setCurrentSlideIndex(prev => prev - 1);
            setActivePointsCount(SLIDES_DATA[currentSlideIndex - 1].pointsKeys.length);
        }
    }, [activePointsCount, currentSlideIndex]);

    const handleReset = useCallback(() => {
        setCurrentSlideIndex(0);
        setActivePointsCount(0);
    }, []);

    const handleClose = () => {
        updateSetting('presentationEnabled', false);
        feedback.toast.info('presentation.deactivated');
    };

    return (
        <div className="w-80 h-full border-r border-outline-variant/30 flex flex-col bg-gradient-to-b from-surface to-surface-container select-none overflow-hidden relative group">
            {/* Background Decorative Element */}
            <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
            
            {/* Header */}
            <div className="p-6 h-[65px] flex items-center justify-between border-b border-outline-variant/20 relative z-10">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60">
                        Presentation
                    </span>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="text-[10px] font-mono text-on-surface-variant/40">
                        {currentSlideIndex + 1} / {SLIDES_DATA.length}
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleClose();
                        }}
                        className="p-1.5 rounded-lg bg-surface-variant/20 hover:bg-error/20 text-on-surface-variant hover:text-error transition-all"
                        title="Close Presentation"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Slide Area */}
            <div 
                className="flex-1 flex flex-col p-8 cursor-pointer active:scale-[0.99] transition-transform"
                onClick={handleNext}
            >
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentSlide.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.4, ease: "circOut" }}
                        className="flex-1 flex flex-col"
                    >
                        <h2 className="text-3xl font-extrabold text-on-surface leading-tight mb-8 tracking-tight">
                            {t(currentSlide.titleKey)}
                        </h2>

                        <div className="space-y-6">
                            {currentSlide.pointsKeys.map((pointKey, index) => (
                                <AnimatePresence key={pointKey}>
                                    {index < activePointsCount && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            transition={{ duration: 0.4, type: "spring", stiffness: 100 }}
                                            className="flex items-start gap-4"
                                        >
                                            <div className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0 shadow-[0_0_8px_rgba(var(--primary-rgb),0.5)]" />
                                            <p className="text-lg text-on-surface-variant leading-relaxed">
                                                {t(pointKey)}
                                            </p>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            ))}
                        </div>

                        {/* Click to continue hint */}
                        {activePointsCount === 0 && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: [0, 1, 0] }}
                                transition={{ repeat: Infinity, duration: 2 }}
                                className="mt-auto mb-12 flex items-center gap-2 text-primary/60 text-sm font-medium"
                            >
                                <Play size={14} fill="currentColor" />
                                {t('presentation.next')}
                            </motion.div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Footer / Controls */}
            <div className="p-6 grid grid-cols-3 gap-3 border-t border-outline-variant/20 bg-surface/30 backdrop-blur-sm">
                <button
                    onClick={(e) => { e.stopPropagation(); handleBack(); }}
                    disabled={currentSlideIndex === 0 && activePointsCount === 0}
                    className="flex items-center justify-center p-3 rounded-2xl bg-surface-variant/30 text-on-surface-variant hover:bg-surface-variant/50 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                    title={t('presentation.prev')}
                >
                    <ChevronLeft size={20} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); handleReset(); }}
                    className="flex items-center justify-center p-3 rounded-2xl bg-surface-variant/30 text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
                    title={t('presentation.reset')}
                >
                    <RotateCcw size={18} />
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); handleNext(); }}
                    className="flex items-center justify-center p-3 rounded-2xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    title={t('presentation.next')}
                >
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );
}
