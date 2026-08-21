export interface SlideData {
    id: string;
    titleKey: string;
    pointsKeys: string[];
}

export const SLIDES_DATA: SlideData[] = [
    {
        id: 'welcome',
        titleKey: 'Robot Runner 3.0.0',
        pointsKeys: [
            //         'presentation.slides.welcome.points.0',
            //         'presentation.slides.welcome.points.1',
            //         'presentation.slides.welcome.points.2',
            //         'presentation.slides.welcome.points.3',
            //         'presentation.slides.welcome.points.4',
            //     ]
            // },
            // {
            //     id: 'test_execution',
            //     titleKey: 'presentation.slides.test_execution.title',
            //     pointsKeys: [
            //         'presentation.slides.test_execution.points.0',
            //         'presentation.slides.test_execution.points.1',
            //         'presentation.slides.test_execution.points.2',
            //         'presentation.slides.test_execution.points.3',
            //     ]
            // },
            // {
            //     id: 'test_analysis',
            //     titleKey: 'presentation.slides.test_analysis.title',
            //     pointsKeys: [
            //         'presentation.slides.test_analysis.points.0',
            //         'presentation.slides.test_analysis.points.1',
            //         'presentation.slides.test_analysis.points.2',
            //         'presentation.slides.test_analysis.points.3',
            //     ]
            // },
            // {
            //     id: 'toolbox',
            //     titleKey: 'presentation.slides.toolbox.title',
            //     pointsKeys: [
            //         'presentation.slides.toolbox.points.0',
            //         'presentation.slides.toolbox.points.1',
            //         'presentation.slides.toolbox.points.2',
            //     ]
            // },
            // {
            //     id: 'inspector_mapper',
            //     titleKey: 'presentation.slides.inspector_mapper.title',
            //     pointsKeys: [
            //         'presentation.slides.inspector_mapper.points.0',
            //         'presentation.slides.inspector_mapper.points.1',
            //         'presentation.slides.inspector_mapper.points.2',
            //         'presentation.slides.inspector_mapper.points.3',
            //     ]
            // },
            // {
            //     id: 'ai_assistant',
            //     titleKey: 'presentation.slides.ai_assistant.title',
            //     pointsKeys: [
            //         'presentation.slides.ai_assistant.points.2',
            //         'presentation.slides.ai_assistant.points.1',
            //         'presentation.slides.ai_assistant.points.0',
            //         'presentation.slides.ai_assistant.points.3',
            //     ]
            // },
            // {
            //     id: 'pos_execution',
            //     titleKey: 'Recursos orientados a POS',
            //     pointsKeys: [
            'Logcat em tempo real',
            'Estatísticas de Performance',
            'Cronômetro de Scanner',
            'Gestor de aplicativos',
            'Execução de testes in-device',
            'Checkup do OS',
            'Companion App'
        ]
    },
    {
        id: 'checkup',
        titleKey: 'Checkup do OS',
        pointsKeys: [
            'Informações resgatadas automaticamente',
            'Informações resgatadas por comandos ADB',
            'Checagens Manuais e por Script',
            'Testes in-device: automações e Companion',
            'Geração de Parâmetros Golden',
            'Geração de relatório de conformidade',
            'Publicação de Relatórios'
        ]
    },
    {
        id: 'settings',
        titleKey: 'presentation.slides.settings.title',
        pointsKeys: [
            // 'presentation.slides.settings.points.2',
            // 'presentation.slides.settings.points.3',
            // 'presentation.slides.settings.points.1',
            // 'presentation.slides.settings.points.0',
            'Criação facilitada de Perfis',
            'Requisito Único: ADBs',
            'Variável de Ambiente: ANDROID_HOME (pasta do Android SDK)'
        ]
    }
];
