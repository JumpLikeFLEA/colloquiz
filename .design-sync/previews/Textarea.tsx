import { Textarea, Label } from 'colloquiz';

export const Default = () => (
  <div className="w-80"><Textarea placeholder="Write your answer…" /></div>
);

export const WithLabel = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="explain">Explain your reasoning</Label>
    <Textarea id="explain" defaultValue="The reaction proceeds via an SN2 mechanism because…" rows={4} />
  </div>
);
