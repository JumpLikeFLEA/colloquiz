import {
  Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem,
  MenubarSeparator, MenubarShortcut,
} from 'colloquiz';

export const EditorBar = () => (
  <Menubar value="quiz">
    <MenubarMenu value="quiz">
      <MenubarTrigger>Quiz</MenubarTrigger>
      <MenubarContent>
        <MenubarItem>New question <MenubarShortcut>⌘N</MenubarShortcut></MenubarItem>
        <MenubarItem>Import questions</MenubarItem>
        <MenubarSeparator />
        <MenubarItem>Publish</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
    <MenubarMenu value="view">
      <MenubarTrigger>View</MenubarTrigger>
    </MenubarMenu>
    <MenubarMenu value="help">
      <MenubarTrigger>Help</MenubarTrigger>
    </MenubarMenu>
  </Menubar>
);
