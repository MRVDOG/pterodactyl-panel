import React from 'react';
import classNames from 'classnames';
import styles from '@/components/server/console/style.module.css';

interface GamePanelProps {
    title: string;
    action?: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}

/**
 * A card matching the console's stat graphs, used for game-specific panels.
 */
export default ({ title, action, footer, className, children }: GamePanelProps) => (
    <div className={classNames(styles.chart_container, 'group flex flex-col h-80', className)}>
        <div className={'flex items-center justify-between px-4 py-2'}>
            <h3 className={'font-header font-medium transition-colors duration-100 group-hover:text-gray-50'}>
                {title}
            </h3>
            {action && <div className={'text-sm flex items-center'}>{action}</div>}
        </div>
        <div className={'flex-1 min-h-0 overflow-y-auto px-4 pb-3 text-sm'}>{children}</div>
        {footer && <div className={'px-4 py-2 border-t border-gray-700 text-xs text-gray-500'}>{footer}</div>}
    </div>
);

export const PanelMessage = ({ children }: { children: React.ReactNode }) => (
    <div className={'h-full flex items-center justify-center text-center text-gray-400 px-2'}>{children}</div>
);

export const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className={'flex justify-between gap-4 py-1 border-b border-gray-700 last:border-0'}>
        <span className={'text-gray-400 flex-shrink-0'}>{label}</span>
        <span className={'text-gray-100 text-right truncate'}>{children}</span>
    </div>
);
