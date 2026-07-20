import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuShortcut, ContextMenuLabel,
} from 'colloquiz';

// Radix ContextMenu opens on right-click and has no controlled-open prop, so a
// static preview shows the trigger surface plus a detached copy of the menu
// content (same components the trigger renders) so the styling is visible.
export const QuestionMenu = () => (
  <div className="flex items-start gap-6">
    <ContextMenu>
      <ContextMenuTrigger className="flex h-28 w-56 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        Right-click a question
      </ContextMenuTrigger>
      <ContextMenuContent />
    </ContextMenu>
    <div className="min-w-48 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
      <ContextMenuLabel>Question</ContextMenuLabel>
      <div className="relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm">Edit<ContextMenuShortcut>⌘E</ContextMenuShortcut></div>
      <div className="relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm">Duplicate</div>
      <ContextMenuSeparator />
      <div className="relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm text-destructive">Remove</div>
    </div>
  </div>
);
