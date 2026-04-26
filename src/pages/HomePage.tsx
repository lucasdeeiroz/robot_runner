
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/organisms/PageHeader';
import { Home } from 'lucide-react';
import { HomeSubTab } from '@/components/tabs/home/HomeSubTab';

interface HomePageProps {
    onNavigate: (page: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
    const { t } = useTranslation();

    return (
        <div className="h-full flex flex-col gap-4">
            <PageHeader
                title={t('sidebar.home')}
                description={t('sidebar.description_home')}
                icon={Home}
                iconSize="lg"
            />

            <div className="flex-1 min-h-0 relative z-10">
                <HomeSubTab onNavigate={onNavigate} />
            </div>
        </div>
    );
}
