import { Checkbox, Label } from 'colloquiz';

export const States = () => (
  <div className="grid gap-3">
    <div className="flex items-center gap-2"><Checkbox id="c1" /> <Label htmlFor="c1">Unchecked</Label></div>
    <div className="flex items-center gap-2"><Checkbox id="c2" defaultChecked /> <Label htmlFor="c2">Checked</Label></div>
    <div className="flex items-center gap-2"><Checkbox id="c3" disabled /> <Label htmlFor="c3">Disabled</Label></div>
  </div>
);

export const Terms = () => (
  <div className="flex items-start gap-2 w-80">
    <Checkbox id="terms" defaultChecked className="mt-0.5" />
    <Label htmlFor="terms" className="leading-snug font-normal">
      Shuffle question order each time I take this quiz
    </Label>
  </div>
);
