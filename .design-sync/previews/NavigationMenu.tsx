import {
  NavigationMenu, NavigationMenuList, NavigationMenuItem, NavigationMenuTrigger,
  NavigationMenuContent, NavigationMenuLink,
} from 'colloquiz';

export const MainNav = () => (
  <NavigationMenu>
    <NavigationMenuList>
      <NavigationMenuItem>
        <NavigationMenuTrigger>Subjects</NavigationMenuTrigger>
        <NavigationMenuContent>
          <ul className="grid w-64 gap-1 p-2">
            <li><NavigationMenuLink className="block rounded-md p-2 text-sm hover:bg-accent">Chemistry</NavigationMenuLink></li>
            <li><NavigationMenuLink className="block rounded-md p-2 text-sm hover:bg-accent">Biology</NavigationMenuLink></li>
            <li><NavigationMenuLink className="block rounded-md p-2 text-sm hover:bg-accent">Physics</NavigationMenuLink></li>
          </ul>
        </NavigationMenuContent>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink className="px-4 py-2 text-sm font-medium">Library</NavigationMenuLink>
      </NavigationMenuItem>
      <NavigationMenuItem>
        <NavigationMenuLink className="px-4 py-2 text-sm font-medium">Stats</NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenuList>
  </NavigationMenu>
);
