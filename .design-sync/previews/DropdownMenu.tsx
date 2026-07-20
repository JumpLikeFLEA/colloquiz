import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, Button,
} from 'colloquiz';
import { Pencil, Copy, Share2, Trash2 } from 'lucide-react';

export const QuizActions = () => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger asChild>
      <Button variant="outline">Actions</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent className="w-52" align="start">
      <DropdownMenuLabel>Quiz</DropdownMenuLabel>
      <DropdownMenuItem><Pencil /> Edit<DropdownMenuShortcut>⌘E</DropdownMenuShortcut></DropdownMenuItem>
      <DropdownMenuItem><Copy /> Duplicate</DropdownMenuItem>
      <DropdownMenuItem><Share2 /> Share link</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive"><Trash2 /> Delete</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);
