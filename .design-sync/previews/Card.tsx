import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction,
  Button, Badge,
} from 'colloquiz';
import { BookOpen } from 'lucide-react';

export const SubjectCard = () => (
  <Card className="w-80">
    <CardHeader>
      <CardTitle>Organic Chemistry</CardTitle>
      <CardDescription>Reaction mechanisms, stereochemistry, and functional groups.</CardDescription>
      <CardAction>
        <Badge variant="secondary">Hard</Badge>
      </CardAction>
    </CardHeader>
    <CardContent className="text-sm text-muted-foreground">
      24 questions · ~15 min · last scored 82%
    </CardContent>
    <CardFooter className="gap-2">
      <Button className="flex-1">Start quiz</Button>
      <Button variant="outline" size="icon" aria-label="Details"><BookOpen /></Button>
    </CardFooter>
  </Card>
);

export const StatCard = () => (
  <Card className="w-64">
    <CardHeader>
      <CardDescription>Quizzes completed</CardDescription>
      <CardTitle className="text-3xl tabular-nums">128</CardTitle>
    </CardHeader>
    <CardContent className="text-sm text-muted-foreground">
      +12 this week across 6 subjects
    </CardContent>
  </Card>
);
