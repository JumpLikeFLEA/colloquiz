import { Badge } from 'colloquiz';
import { Check } from 'lucide-react';

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge>Default</Badge>
    <Badge variant="secondary">Biology</Badge>
    <Badge variant="outline">Draft</Badge>
    <Badge variant="destructive">Overdue</Badge>
  </div>
);

export const Difficulty = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="secondary">Easy</Badge>
    <Badge variant="secondary">Medium</Badge>
    <Badge variant="secondary">Hard</Badge>
    <Badge><Check className="size-3" /> Completed</Badge>
  </div>
);
