import {
  Collapsible, CollapsibleTrigger, CollapsibleContent, Button,
} from 'colloquiz';
import { ChevronsUpDown } from 'lucide-react';

export const Hint = () => (
  <Collapsible defaultOpen className="w-80 space-y-2">
    <div className="flex items-center justify-between gap-4">
      <h4 className="text-sm font-medium">Show hint</h4>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle"><ChevronsUpDown /></Button>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent className="space-y-2">
      <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
        Consider the oxidation state of the central atom before balancing.
      </div>
    </CollapsibleContent>
  </Collapsible>
);
