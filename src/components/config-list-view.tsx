'use client';

import {ConfigTable} from '@/components/config-table';

export interface ConfigListViewProps {
  onConfigClick?: (configName: string) => void;
  onNewConfigClick?: () => void;
}

export function ConfigListView({onConfigClick, onNewConfigClick}: ConfigListViewProps) {
  return <ConfigTable onConfigClick={onConfigClick} onNewConfigClick={onNewConfigClick} />;
}
