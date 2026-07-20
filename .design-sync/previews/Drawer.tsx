import {
  Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle,
  DrawerDescription, DrawerFooter, DrawerClose, Button,
} from 'colloquiz';

export const QuizSummary = () => (
  <Drawer defaultOpen>
    <DrawerTrigger asChild>
      <Button variant="outline">View results</Button>
    </DrawerTrigger>
    <DrawerContent>
      <div className="mx-auto w-full max-w-sm">
        <DrawerHeader>
          <DrawerTitle>Quiz complete — 82%</DrawerTitle>
          <DrawerDescription>You answered 20 of 24 questions correctly.</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button>Review answers</Button>
          <DrawerClose asChild><Button variant="outline">Close</Button></DrawerClose>
        </DrawerFooter>
      </div>
    </DrawerContent>
  </Drawer>
);
