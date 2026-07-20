import { ToggleGroup, ToggleGroupItem } from 'colloquiz';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

export const SingleSelect = () => (
  <ToggleGroup type="single" defaultValue="center" variant="outline">
    <ToggleGroupItem value="left" aria-label="Left"><AlignLeft /></ToggleGroupItem>
    <ToggleGroupItem value="center" aria-label="Center"><AlignCenter /></ToggleGroupItem>
    <ToggleGroupItem value="right" aria-label="Right"><AlignRight /></ToggleGroupItem>
  </ToggleGroup>
);

export const Difficulty = () => (
  <ToggleGroup type="single" defaultValue="medium">
    <ToggleGroupItem value="easy">Easy</ToggleGroupItem>
    <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
    <ToggleGroupItem value="hard">Hard</ToggleGroupItem>
  </ToggleGroup>
);
