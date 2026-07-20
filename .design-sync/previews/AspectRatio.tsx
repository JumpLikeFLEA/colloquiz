import { AspectRatio } from 'colloquiz';

export const Ratio16x9 = () => (
  <div className="w-80">
    <AspectRatio ratio={16 / 9} className="rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-sm">
      16 : 9 diagram
    </AspectRatio>
  </div>
);

export const Square = () => (
  <div className="w-48">
    <AspectRatio ratio={1} className="rounded-lg bg-secondary flex items-center justify-center text-secondary-foreground text-sm">
      1 : 1
    </AspectRatio>
  </div>
);
