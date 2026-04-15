export interface SlideData {
    id: string;
    titleKey: string;
    pointsKeys: string[];
}

export const SLIDES_DATA: SlideData[] = [
    {
        id: 'welcome',
        titleKey: 'presentation.slides.welcome.title',
        pointsKeys: [
            'presentation.slides.welcome.points.0',
            'presentation.slides.welcome.points.1',
            'presentation.slides.welcome.points.2',
            'presentation.slides.welcome.points.3',
            'presentation.slides.welcome.points.4',
        ]
    },
    {
        id: 'test_execution',
        titleKey: 'presentation.slides.test_execution.title',
        pointsKeys: [
            'presentation.slides.test_execution.points.0',
            'presentation.slides.test_execution.points.1',
            'presentation.slides.test_execution.points.2',
            'presentation.slides.test_execution.points.3',
        ]
    },
    {
        id: 'test_analysis',
        titleKey: 'presentation.slides.test_analysis.title',
        pointsKeys: [
            'presentation.slides.test_analysis.points.0',
            'presentation.slides.test_analysis.points.1',
            'presentation.slides.test_analysis.points.2',
            'presentation.slides.test_analysis.points.3',
        ]
    },
    {
        id: 'toolbox',
        titleKey: 'presentation.slides.toolbox.title',
        pointsKeys: [
            'presentation.slides.toolbox.points.0',
            'presentation.slides.toolbox.points.1',
            'presentation.slides.toolbox.points.2',
        ]
    },
    {
        id: 'inspector_mapper',
        titleKey: 'presentation.slides.inspector_mapper.title',
        pointsKeys: [
            'presentation.slides.inspector_mapper.points.0',
            'presentation.slides.inspector_mapper.points.1',
            'presentation.slides.inspector_mapper.points.2',
            'presentation.slides.inspector_mapper.points.3',
        ]
    },
    {
        id: 'ai_assistant',
        titleKey: 'presentation.slides.ai_assistant.title',
        pointsKeys: [
            'presentation.slides.ai_assistant.points.2',
            'presentation.slides.ai_assistant.points.1',
            'presentation.slides.ai_assistant.points.0',
            'presentation.slides.ai_assistant.points.3',
        ]
    },
    {
        id: 'settings',
        titleKey: 'presentation.slides.settings.title',
        pointsKeys: [
            'presentation.slides.settings.points.2',
            'presentation.slides.settings.points.3',
            'presentation.slides.settings.points.1',
            'presentation.slides.settings.points.0',
        ]
    }
];
