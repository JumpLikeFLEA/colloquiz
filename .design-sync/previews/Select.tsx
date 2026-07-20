import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectGroup,
  SelectLabel, SelectItem, SelectSeparator,
} from 'colloquiz';

export const SubjectPicker = () => (
  <Select defaultValue="chem" defaultOpen>
    <SelectTrigger className="w-56">
      <SelectValue placeholder="Choose a subject" />
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        <SelectLabel>Sciences</SelectLabel>
        <SelectItem value="chem">Chemistry</SelectItem>
        <SelectItem value="bio">Biology</SelectItem>
        <SelectItem value="phys">Physics</SelectItem>
      </SelectGroup>
      <SelectSeparator />
      <SelectGroup>
        <SelectLabel>Humanities</SelectLabel>
        <SelectItem value="hist">History</SelectItem>
        <SelectItem value="lit">Literature</SelectItem>
      </SelectGroup>
    </SelectContent>
  </Select>
);
