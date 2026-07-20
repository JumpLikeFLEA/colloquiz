import { ScrollArea, Separator } from 'colloquiz';

const topics = [
  'Atomic structure', 'Periodic trends', 'Chemical bonding', 'Stoichiometry',
  'Thermochemistry', 'Kinetics', 'Equilibrium', 'Acids and bases',
  'Redox reactions', 'Organic nomenclature', 'Isomerism', 'Spectroscopy',
];

export const TopicList = () => (
  <ScrollArea className="h-56 w-64 rounded-md border">
    <div className="p-4">
      <h4 className="mb-3 text-sm font-medium leading-none">Syllabus</h4>
      {topics.map((t) => (
        <div key={t}>
          <div className="py-1.5 text-sm">{t}</div>
          <Separator />
        </div>
      ))}
    </div>
  </ScrollArea>
);
