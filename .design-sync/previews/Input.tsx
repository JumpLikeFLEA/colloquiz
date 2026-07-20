import { Input, Label } from 'colloquiz';

export const Default = () => (
  <div className="w-72"><Input placeholder="Search subjects…" /></div>
);

export const WithLabel = () => (
  <div className="grid w-72 gap-2">
    <Label htmlFor="quiz-name">Quiz name</Label>
    <Input id="quiz-name" defaultValue="Cell Biology — Midterm" />
  </div>
);

export const States = () => (
  <div className="grid w-72 gap-3">
    <Input placeholder="Default" />
    <Input placeholder="Disabled" disabled />
    <Input defaultValue="Invalid entry" aria-invalid="true" />
  </div>
);
