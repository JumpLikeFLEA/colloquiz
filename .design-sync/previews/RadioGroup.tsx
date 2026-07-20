import { RadioGroup, RadioGroupItem, Label } from 'colloquiz';

export const QuizAnswers = () => (
  <RadioGroup defaultValue="b" className="w-96 gap-3">
    <div className="flex items-center gap-2"><RadioGroupItem value="a" id="a" /><Label htmlFor="a" className="font-normal">Nucleophilic substitution</Label></div>
    <div className="flex items-center gap-2"><RadioGroupItem value="b" id="b" /><Label htmlFor="b" className="font-normal">Electrophilic addition</Label></div>
    <div className="flex items-center gap-2"><RadioGroupItem value="c" id="c" /><Label htmlFor="c" className="font-normal">Free-radical halogenation</Label></div>
    <div className="flex items-center gap-2"><RadioGroupItem value="d" id="d" disabled /><Label htmlFor="d" className="font-normal">Elimination (disabled)</Label></div>
  </RadioGroup>
);
