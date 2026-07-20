import {
  TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, Button,
} from 'colloquiz';
import { Info } from 'lucide-react';

export const Hint = () => (
  <TooltipProvider>
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Info"><Info /></Button>
      </TooltipTrigger>
      <TooltipContent>Questions are drawn at random each attempt</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
