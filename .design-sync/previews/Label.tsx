import { Label, Input, Checkbox } from 'colloquiz';

export const WithInput = () => (
  <div className="grid w-72 gap-2">
    <Label htmlFor="email">Email address</Label>
    <Input id="email" type="email" placeholder="you@example.com" />
  </div>
);

export const WithCheckbox = () => (
  <div className="flex items-center gap-2">
    <Checkbox id="remember" defaultChecked />
    <Label htmlFor="remember">Remember my progress</Label>
  </div>
);
