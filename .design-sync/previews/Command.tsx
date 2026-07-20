import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup,
  CommandItem, CommandShortcut, CommandSeparator,
} from 'colloquiz';
import { Search, BookOpen, Plus, Settings } from 'lucide-react';

export const Palette = () => (
  <Command className="w-80 rounded-lg border shadow-md">
    <CommandInput placeholder="Search quizzes and actions…" />
    <CommandList>
      <CommandEmpty>No results found.</CommandEmpty>
      <CommandGroup heading="Subjects">
        <CommandItem><BookOpen /> Organic Chemistry</CommandItem>
        <CommandItem><BookOpen /> Cell Biology</CommandItem>
        <CommandItem><Search /> Thermodynamics</CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Actions">
        <CommandItem><Plus /> New quiz<CommandShortcut>⌘N</CommandShortcut></CommandItem>
        <CommandItem><Settings /> Settings</CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
);
