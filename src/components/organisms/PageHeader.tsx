import React from 'react';
import { LucideIcon } from 'lucide-react';
import { IconBox } from '../atoms/IconBox';
import { Heading, Text } from '../atoms/Typography';

interface PageHeaderProps {
    title: string;
    description?: string;
    icon?: LucideIcon;
    rightElement?: React.ReactNode;
}

export const PageHeader = ({ title, description, icon, rightElement }: PageHeaderProps) => {
    return (
        <div className="flex items-center justify-between pb-6 pt-2">
            <div className="flex items-center gap-4">
                {icon && (
                    <IconBox icon={icon} size="lg" variant="primary" />
                )}
                <div>
                    <Heading level={2}>{title}</Heading>
                    {description && (
                        <Text variant="muted" size="sm">
                            {description}
                        </Text>
                    )}
                </div>
            </div>
            {rightElement && (
                <div className="flex items-center gap-3">
                    {rightElement}
                </div>
            )}
        </div>
    );
};
