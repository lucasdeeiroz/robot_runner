import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/organisms/Modal';
import { Button } from '@/components/atoms/Button';
import { Download, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { UpdateAsset, downloadAndInstall } from '@/lib/updater';
import { feedback } from '@/lib/feedback';

interface UpdateModalProps {
    isOpen: boolean;
    onClose: () => void;
    assets: UpdateAsset[];
    latestVersion: string;
}

export function UpdateModal({ isOpen, onClose, assets, latestVersion }: UpdateModalProps) {
    const { t } = useTranslation();
    const [isDownloading, setIsDownloading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [downloadedAsset, setDownloadedAsset] = useState<string | null>(null);

    const handleDownload = async (asset: UpdateAsset) => {
        setIsDownloading(true);
        setProgress(0);
        try {
            await downloadAndInstall(asset, (p) => setProgress(p));
            setDownloadedAsset(asset.name);
            feedback.toast.success(t('about.update_downloaded', "Download complete! Opening installer..."));
        } catch (e) {
            feedback.toast.error(t('about.update_download_error', "Failed to download update."));
        } finally {
            setIsDownloading(false);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('about.update_title', "New Version Available")}
            className="max-w-md"
        >
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4 p-4 bg-primary/5 border border-primary/10 rounded-2xl">
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                        <Download size={24} />
                    </div>
                    <div>
                        <h4 className="font-semibold text-on-surface">v{latestVersion}</h4>
                        <p className="text-sm text-on-surface-variant">{t('about.update_select_installer', "Select the installer for your system")}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    {assets.map((asset) => (
                        <div 
                            key={asset.url}
                            className="flex items-center justify-between p-4 bg-surface-variant/20 border border-outline-variant/30 rounded-2xl hover:border-primary/30 transition-colors"
                        >
                            <div className="flex flex-col">
                                <span className="font-medium text-sm text-on-surface">{asset.name}</span>
                                <span className="text-xs text-on-surface-variant">{formatSize(asset.size)} • {asset.type === 'installer' ? t('about.installer', 'Installer') : t('about.portable', 'Portable')}</span>
                            </div>
                            
                            <Button
                                size="sm"
                                variant={downloadedAsset === asset.name ? "success" : "primary"}
                                onClick={() => handleDownload(asset)}
                                disabled={isDownloading}
                                leftIcon={downloadedAsset === asset.name ? <CheckCircle2 size={14} /> : <Download size={14} />}
                            >
                                {downloadedAsset === asset.name ? t('common.done', 'Done') : t('common.download', 'Download')}
                            </Button>
                        </div>
                    ))}
                </div>

                {isDownloading && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-medium text-on-surface-variant">
                            <span>{t('about.downloading', 'Downloading update...')}</span>
                            <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-outline-variant/30 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-primary transition-all duration-300" 
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-center pt-2">
                    <p className="text-[10px] text-on-surface-variant/60 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {t('about.update_manual_hint', "Installer will open automatically after download.")}
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => window.open('https://github.com/lucasdeeiroz/robot_runner/releases/latest', '_blank')}
                        rightIcon={<ExternalLink size={12} />}
                    >
                        {t('about.view_releases', "View on GitHub")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
