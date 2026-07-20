import { Avatar, AvatarImage, AvatarFallback } from 'colloquiz';

export const Fallbacks = () => (
  <div className="flex items-center gap-3">
    <Avatar><AvatarFallback>GC</AvatarFallback></Avatar>
    <Avatar><AvatarFallback>AB</AvatarFallback></Avatar>
    <Avatar className="size-12"><AvatarFallback>MK</AvatarFallback></Avatar>
  </div>
);

export const Group = () => (
  <div className="flex -space-x-2">
    <Avatar className="ring-2 ring-background"><AvatarFallback>GC</AvatarFallback></Avatar>
    <Avatar className="ring-2 ring-background"><AvatarFallback>AB</AvatarFallback></Avatar>
    <Avatar className="ring-2 ring-background"><AvatarFallback>MK</AvatarFallback></Avatar>
    <Avatar className="ring-2 ring-background"><AvatarFallback>+5</AvatarFallback></Avatar>
  </div>
);
