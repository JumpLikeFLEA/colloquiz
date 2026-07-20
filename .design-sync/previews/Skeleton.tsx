import { Skeleton } from 'colloquiz';

export const Card = () => (
  <div className="flex w-80 flex-col gap-3 rounded-xl border p-4">
    <Skeleton className="h-5 w-40" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-3/4" />
    <div className="flex gap-2 pt-2">
      <Skeleton className="h-9 flex-1" />
      <Skeleton className="h-9 w-9" />
    </div>
  </div>
);

export const Avatar = () => (
  <div className="flex items-center gap-3">
    <Skeleton className="size-10 rounded-full" />
    <div className="grid gap-2">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-24" />
    </div>
  </div>
);
