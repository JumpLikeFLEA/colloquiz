import { Slider, Label } from 'colloquiz';

export const Default = () => (
  <div className="w-72"><Slider defaultValue={[60]} max={100} step={1} /></div>
);

export const Range = () => (
  <div className="grid w-72 gap-2">
    <Label>Difficulty range</Label>
    <Slider defaultValue={[25, 75]} max={100} step={5} />
  </div>
);
