import { Progress } from 'colloquiz';

export const Levels = () => (
  <div className="grid w-80 gap-4">
    <Progress value={20} />
    <Progress value={60} />
    <Progress value={92} />
  </div>
);

export const QuizProgress = () => (
  <div className="grid w-80 gap-2">
    <div className="flex justify-between text-sm text-muted-foreground"><span>Question 15 of 24</span><span>62%</span></div>
    <Progress value={62} />
  </div>
);
