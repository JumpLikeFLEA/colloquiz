import { Button } from 'colloquiz';
import { Play, Plus, Loader2 } from 'lucide-react';

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Start quiz</Button>
    <Button variant="secondary">Save draft</Button>
    <Button variant="outline">Preview</Button>
    <Button variant="destructive">Delete</Button>
    <Button variant="ghost">Skip</Button>
    <Button variant="link">Learn more</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="sm">Small</Button>
    <Button size="default">Default</Button>
    <Button size="lg">Large</Button>
    <Button size="icon" aria-label="Add"><Plus /></Button>
  </div>
);

export const WithIcon = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button><Play /> Play round</Button>
    <Button variant="outline"><Plus /> New question</Button>
  </div>
);

export const States = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button disabled>Disabled</Button>
    <Button disabled><Loader2 className="animate-spin" /> Submitting…</Button>
  </div>
);
