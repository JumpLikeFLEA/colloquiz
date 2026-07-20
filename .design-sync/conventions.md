# Colloquiz UI — how to build with this design system

Colloquiz is a quiz/study platform. This library is its shadcn-style component set (Radix
primitives) styled with **Tailwind CSS v4 utility classes** driven by CSS-variable design
tokens. Build screens by composing these components and laying them out with the same Tailwind
token utilities listed below — never invent new class names or hard-coded colors.

## Setup & wrapping

Most components render correctly with no wrapper. Three need context:

- **Tooltip** → wrap in `TooltipProvider` (once, high in the tree): `<TooltipProvider>…</TooltipProvider>`.
- **Sidebar** → wrap the sidebar + main content in `SidebarProvider`. Use `SidebarTrigger` to toggle.
- **Form** → uses `react-hook-form`; create `const form = useForm()`, spread `<Form {...form}>`, and
  wire fields with `FormField` + `FormItem`/`FormLabel`/`FormControl`/`FormMessage`.

Dark mode: add `class="dark"` to an ancestor element — every token below has a dark value.
Compound components come in families: e.g. `Card` + `CardHeader`/`CardTitle`/`CardDescription`/
`CardContent`/`CardFooter`; `Dialog` + `DialogTrigger`/`DialogContent`/`DialogHeader`/`DialogTitle`/
`DialogFooter`. Import the parent from the library and its parts are alongside it.

## The styling idiom — Tailwind v4 + token utilities

Color the UI **only** through these semantic token utilities, used as `bg-<token>` / `text-<token>` /
`border-<token>` (and `ring-<token>` for focus). Do not use raw Tailwind palette colors (`bg-zinc-800`)
or hex — these tokens are what make output on-brand and dark-mode correct:

| Token | Use |
|---|---|
| `background` / `foreground` | page surface + default text |
| `card` / `card-foreground` | card and panel surfaces |
| `popover` / `popover-foreground` | menus, popovers, dropdowns |
| `primary` / `primary-foreground` | primary actions, emphasis (near-black brand color) |
| `secondary` / `secondary-foreground` | secondary buttons, subtle chips |
| `muted` / `muted-foreground` | muted backgrounds, secondary/helper text |
| `accent` / `accent-foreground` | hover states, highlighted rows |
| `destructive` | destructive actions and errors (crimson) |
| `border` / `input` / `ring` | borders, input borders, focus rings |
| `chart-1` … `chart-5` | data-viz series colors — reference as `var(--chart-1)`…`var(--chart-5)` (e.g. in `ChartContainer`'s `config`), not `bg-chart-*` |
| `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-accent`, `sidebar-border` | sidebar surface |

Radius uses the `--radius` scale: `rounded-sm` `rounded-md` `rounded-lg` `rounded-xl`. Spacing,
flex/grid, and typography use standard Tailwind utilities (`flex gap-3`, `grid gap-2`, `px-4`,
`text-sm`, `text-muted-foreground`, `font-medium`). Class lists are merged with `cn()` internally,
so passing `className` to any component overrides safely.

Variant/size props (via `class-variance-authority`) carry the design language — prefer them over
restyling:

- **Button**: `variant` = `default | secondary | outline | ghost | link | destructive`; `size` = `default | sm | lg | icon`.
- **Badge**: `variant` = `default | secondary | outline | destructive`.
- **Toggle** / **ToggleGroup**: `variant` = `default | outline`; `size` = `default | sm | lg`.
- **Alert**: `variant` = `default | destructive`.

## Where the truth lives

- `styles.css` → imports `_ds_bundle.css` (the compiled Tailwind utilities + `:root`/`.dark` token
  definitions). Read it to see every available token and utility.
- Per component: `components/general/<Name>/<Name>.d.ts` (the prop contract) and `<Name>.prompt.md`
  (usage). Read these before using a component you're unsure about.

## One idiomatic example

```tsx
// A subject card — library components for the controls, token utilities for layout glue.
<Card className="w-80">
  <CardHeader>
    <CardTitle>Organic Chemistry</CardTitle>
    <CardDescription>Reaction mechanisms and functional groups.</CardDescription>
    <CardAction><Badge variant="secondary">Hard</Badge></CardAction>
  </CardHeader>
  <CardContent className="text-sm text-muted-foreground">24 questions · ~15 min</CardContent>
  <CardFooter className="gap-2">
    <Button className="flex-1">Start quiz</Button>
    <Button variant="outline" size="icon" aria-label="Details"><BookOpen /></Button>
  </CardFooter>
</Card>
```

Icons are from `lucide-react`. Note: `Toaster` (sonner) and `ResizablePanelGroup` ship as importable
components but have minimal preview cards.
