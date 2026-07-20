import { Separator } from 'colloquiz';

export const Horizontal = () => (
  <div className="w-72">
    <div className="text-sm font-medium">Quiz settings</div>
    <p className="text-sm text-muted-foreground">Control how this quiz behaves.</p>
    <Separator className="my-3" />
    <div className="flex h-5 items-center gap-3 text-sm">
      <span>Timer</span><Separator orientation="vertical" />
      <span>Shuffle</span><Separator orientation="vertical" />
      <span>Retries</span>
    </div>
  </div>
);
