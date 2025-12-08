import {CircleHelp} from 'lucide-react';
import type {ReactNode} from 'react';

import {Tooltip, TooltipContent, TooltipTrigger} from './tooltip';

interface HelpProps {
  children: ReactNode;
  className?: string;
}

export function Help({children, className = 'max-w-xs'}: HelpProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <CircleHelp className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent className={className}>{children}</TooltipContent>
    </Tooltip>
  );
}
