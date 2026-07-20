import {
  Popover, PopoverTrigger, PopoverContent, Button, Label, Input, Slider,
} from 'colloquiz';

export const Filters = () => (
  <Popover defaultOpen>
    <PopoverTrigger asChild>
      <Button variant="outline">Filters</Button>
    </PopoverTrigger>
    <PopoverContent className="w-72">
      <div className="grid gap-4">
        <div className="space-y-1">
          <h4 className="font-medium leading-none">Quiz filters</h4>
          <p className="text-sm text-muted-foreground">Narrow down the question set.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="topic">Topic</Label>
          <Input id="topic" defaultValue="Thermodynamics" className="h-8" />
        </div>
        <div className="grid gap-2">
          <Label>Max difficulty</Label>
          <Slider defaultValue={[70]} max={100} />
        </div>
      </div>
    </PopoverContent>
  </Popover>
);
