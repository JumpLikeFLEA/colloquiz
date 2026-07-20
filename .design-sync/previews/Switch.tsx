import { Switch, Label } from 'colloquiz';

export const States = () => (
  <div className="grid gap-3">
    <div className="flex items-center gap-2"><Switch id="s1" /> <Label htmlFor="s1">Off</Label></div>
    <div className="flex items-center gap-2"><Switch id="s2" defaultChecked /> <Label htmlFor="s2">On</Label></div>
    <div className="flex items-center gap-2"><Switch id="s3" disabled /> <Label htmlFor="s3">Disabled</Label></div>
  </div>
);

export const Setting = () => (
  <div className="flex items-center justify-between w-80">
    <Label htmlFor="timer" className="font-normal">Timed mode</Label>
    <Switch id="timer" defaultChecked />
  </div>
);
