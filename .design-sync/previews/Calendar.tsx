import { Calendar } from 'colloquiz';

export const DueDate = () => (
  <Calendar
    mode="single"
    defaultMonth={new Date(2026, 6, 1)}
    selected={new Date(2026, 6, 20)}
    className="rounded-md border"
  />
);
