import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogClose, Button,
} from 'colloquiz';

export const ConfirmSubmit = () => (
  <Dialog defaultOpen>
    <DialogTrigger asChild>
      <Button>Submit quiz</Button>
    </DialogTrigger>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Submit your answers?</DialogTitle>
        <DialogDescription>
          You answered 22 of 24 questions. You can’t change your answers after submitting.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Keep working</Button>
        </DialogClose>
        <Button>Submit</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
