import { Toggle } from 'colloquiz';
import { Bold, Italic, Star } from 'lucide-react';

export const Variants = () => (
  <div className="flex items-center gap-2">
    <Toggle aria-label="Bold"><Bold /></Toggle>
    <Toggle aria-label="Italic" defaultPressed><Italic /></Toggle>
    <Toggle variant="outline" aria-label="Star"><Star /> Bookmark</Toggle>
  </div>
);

export const Sizes = () => (
  <div className="flex items-center gap-2">
    <Toggle size="sm" aria-label="Bold sm"><Bold /></Toggle>
    <Toggle size="default" aria-label="Bold default"><Bold /></Toggle>
    <Toggle size="lg" aria-label="Bold lg"><Bold /></Toggle>
  </div>
);
