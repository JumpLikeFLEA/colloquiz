import {
  Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription,
  SheetFooter, SheetClose, Button, Label, Input,
} from 'colloquiz';

export const EditPanel = () => (
  <Sheet defaultOpen>
    <SheetTrigger asChild>
      <Button variant="outline">Edit quiz</Button>
    </SheetTrigger>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Quiz settings</SheetTitle>
        <SheetDescription>Update the details for this quiz.</SheetDescription>
      </SheetHeader>
      <div className="grid gap-4 px-4">
        <div className="grid gap-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" defaultValue="Cell Biology — Midterm" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="count">Questions</Label>
          <Input id="count" type="number" defaultValue={24} />
        </div>
      </div>
      <SheetFooter>
        <Button>Save changes</Button>
        <SheetClose asChild><Button variant="outline">Cancel</Button></SheetClose>
      </SheetFooter>
    </SheetContent>
  </Sheet>
);
