import { useForm } from 'react-hook-form';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormDescription,
  FormMessage, Input, Button,
} from 'colloquiz';

export const NewQuiz = () => {
  const form = useForm({ defaultValues: { title: 'Cell Biology — Midterm', questions: '24' } });
  return (
    <Form {...form}>
      <form className="w-80 space-y-5" onSubmit={(e) => e.preventDefault()}>
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quiz title</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormDescription>Shown to learners on the subject page.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="questions"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Questions per attempt</FormLabel>
              <FormControl><Input type="number" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Create quiz</Button>
      </form>
    </Form>
  );
};
