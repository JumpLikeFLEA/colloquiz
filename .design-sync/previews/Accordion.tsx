import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from 'colloquiz';

export const FAQ = () => (
  <Accordion type="single" collapsible defaultValue="a1" className="w-96">
    <AccordionItem value="a1">
      <AccordionTrigger>How are questions selected?</AccordionTrigger>
      <AccordionContent>
        Each attempt draws a random subset from the question bank, so no two runs are identical.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="a2">
      <AccordionTrigger>Can I retake a quiz?</AccordionTrigger>
      <AccordionContent>Yes — retakes are unlimited unless the author disables them.</AccordionContent>
    </AccordionItem>
    <AccordionItem value="a3">
      <AccordionTrigger>Is my progress saved?</AccordionTrigger>
      <AccordionContent>Progress saves automatically after every answer.</AccordionContent>
    </AccordionItem>
  </Accordion>
);
