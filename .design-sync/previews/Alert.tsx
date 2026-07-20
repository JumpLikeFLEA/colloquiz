import { Alert, AlertTitle, AlertDescription } from 'colloquiz';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

export const Info = () => (
  <Alert className="w-96">
    <CheckCircle2 />
    <AlertTitle>Answer saved</AlertTitle>
    <AlertDescription>Your progress on this quiz is saved automatically.</AlertDescription>
  </Alert>
);

export const Destructive = () => (
  <Alert variant="destructive" className="w-96">
    <AlertTriangle />
    <AlertTitle>Time is almost up</AlertTitle>
    <AlertDescription>You have 30 seconds left to submit your answers.</AlertDescription>
  </Alert>
);
