import {
  Tabs, TabsList, TabsTrigger, TabsContent, Card, CardContent,
} from 'colloquiz';

export const QuizTabs = () => (
  <Tabs defaultValue="questions" className="w-96">
    <TabsList>
      <TabsTrigger value="questions">Questions</TabsTrigger>
      <TabsTrigger value="results">Results</TabsTrigger>
      <TabsTrigger value="settings">Settings</TabsTrigger>
    </TabsList>
    <TabsContent value="questions">
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">24 questions · edit, reorder, or add new ones.</CardContent></Card>
    </TabsContent>
    <TabsContent value="results">
      <Card><CardContent className="pt-6 text-sm text-muted-foreground">Average score 78% across 132 attempts.</CardContent></Card>
    </TabsContent>
  </Tabs>
);
