import { MousePointer2, Pointer, MousePointerClick, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function GestureOverlay() {
    const { t } = useTranslation();

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-transparent backdrop-blur-sm rounded-lg pointer-events-none w-full max-w-sm transition-all duration-1000 ease-in-out">
            <div className="bg-transparent border-none shadow-none rounded-2xl p-6 flex flex-col gap-8 w-full max-w-sm">
                <h3 className="text-base font-semibold text-on-surface text-center mb-2">{t('inspector.overlay.title')}</h3>

                <div className="flex flex-col gap-5">
                    {/* Hover */}
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 flex-shrink-0 relative flex items-center justify-center">
                            <div className="w-8 h-8 bg-transparent rounded border-2 border-blue-600 shadow-sm" />
                            <MousePointer2 size={24} className="text-on-surface absolute top-1/2 left-1/2 fill-surface drop-shadow-md animate-bounce" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-on-surface">{t('inspector.overlay.hover.title')}</span>
                            <span className="text-xs text-on-surface-variant/70">{t('inspector.overlay.hover.desc')}</span>
                        </div>
                    </div>

                    {/* Select (Click) */}
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 flex-shrink-0 relative flex items-center justify-center">
                            <div className="w-8 h-8 bg-transparent rounded border-2 border-red-600 shadow-sm" />
                            <Pointer size={24} className="text-on-surface absolute top-1/2 left-1/2 -translate-x-1 -translate-y-1 fill-surface drop-shadow-md animate-ping" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-on-surface">{t('inspector.overlay.select.title')}</span>
                            <span className="text-xs text-on-surface-variant/70">{t('inspector.overlay.select.desc')}</span>
                        </div>
                    </div>

                    {/* Tap (Double Click) */}
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 flex-shrink-0 relative flex items-center justify-center">
                            <div className="w-8 h-8 bg-transparent rounded border-2 border-green-600 shadow-sm" />
                            <MousePointerClick size={26} className="text-on-surface absolute top-1/2 left-1/2 -translate-x-2 -translate-y-2 fill-surface drop-shadow-md animate-ping" />
                            <span className="absolute -top-1 -right-2 text-[11px] font-black text-on-surface bg-green-500/20 px-1 rounded shadow-sm border border-green-500/30 backdrop-blur-md">x2</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-on-surface">{t('inspector.overlay.tap.title')}</span>
                            <span className="text-xs text-on-surface-variant/70">{t('inspector.overlay.tap.desc')}</span>
                        </div>
                    </div>

                    {/* Swipe */}
                    <div className="flex items-center gap-4">
                        <div className="w-24 h-12 flex-shrink-0 relative flex items-center justify-center">
                            <Pointer size={20} className="text-on-surface absolute left-0 top-1/2 -translate-y-1/2 fill-surface drop-shadow-md" />
                            <ArrowRight size={24} className="text-on-surface-variant absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                            <Pointer size={20} className="text-on-surface absolute right-0 top-1/2 -translate-y-1/2 fill-surface drop-shadow-md opacity-60" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-on-surface">{t('inspector.overlay.swipe.title')}</span>
                            <span className="text-xs text-on-surface-variant/70">{t('inspector.overlay.swipe.desc')}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
