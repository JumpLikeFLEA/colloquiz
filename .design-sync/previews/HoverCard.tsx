import {
  HoverCard, HoverCardTrigger, HoverCardContent, Button, Avatar, AvatarFallback,
} from 'colloquiz';

export const AuthorPreview = () => (
  <HoverCard defaultOpen>
    <HoverCardTrigger asChild>
      <Button variant="link" className="px-0">@glebc</Button>
    </HoverCardTrigger>
    <HoverCardContent className="w-72">
      <div className="flex gap-3">
        <Avatar><AvatarFallback>GC</AvatarFallback></Avatar>
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Gleb Chernov</h4>
          <p className="text-sm text-muted-foreground">Author of 18 chemistry quizzes · 4.9★ avg rating</p>
        </div>
      </div>
    </HoverCardContent>
  </HoverCard>
);
