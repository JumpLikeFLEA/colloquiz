"use client";

/**
 * ITEM-010 — dev-only item playground, client half.
 *
 * THROWAWAY RENDERERS. Every `*Body` component below exists only to produce
 * a response shape each type's own `score()` accepts, so this card can prove
 * the five lib/items/* modules end-to-end (parse -> score -> resolve
 * explanations). None of this is the real lesson player — that is M2's job,
 * built against these same fixtures (lib/items/__fixtures__/playgroundExamples.ts).
 * Do not extend this file toward production UI; open an M2 card instead.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { resolveExplanations } from "@/lib/items/explanations";
import { scoreItem } from "@/lib/items/index";
import { shuffleForItem, shuffleOrderingIndices } from "@/lib/items/shuffle";
import type {
  Item,
  ItemScoreResult,
  MatchingItem,
  OrderingItem,
  SelectionGridItem,
  SelectionItem,
  SlotsItem,
} from "@/lib/items/types";

const ATTEMPT_ID = "item-playground";

interface ExampleProps<TItem extends Item> {
  item: TItem;
}

function ScoreResult({ item, result }: { item: Item; result: ItemScoreResult }) {
  const resolved = resolveExplanations(item, result);
  const allCorrect = result.earned === result.possible;
  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        {allCorrect ? (
          <CheckCircle2 className="size-5 text-emerald-600" />
        ) : (
          <XCircle className="size-5 text-destructive" />
        )}
        <span className="font-medium">
          {result.earned.toFixed(2)} / {result.possible.toFixed(2)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {result.subResults.map((sub) => (
          <Badge key={sub.id} variant={sub.correct ? "default" : "destructive"}>
            {sub.id}: {sub.correct ? "correct" : "wrong"}
          </Badge>
        ))}
      </div>
      {resolved.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {resolved.map((r) => (
            <li key={r.subResultId}>
              <span className="font-medium text-foreground">{r.subResultId}:</span> {r.explanation}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SelectionBody({ item }: ExampleProps<SelectionItem>) {
  const options = useMemo(
    () => shuffleForItem(item.payload.options, ATTEMPT_ID, item.id),
    [item],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<ItemScoreResult | null>(null);

  return (
    <>
      <p className="mb-3">{item.payload.prompt}</p>
      {item.payload.multi ? (
        <div className="space-y-2">
          {options.map((option) => (
            <div key={option.id} className="flex items-center gap-2">
              <Checkbox
                id={`${item.id}-${option.id}`}
                checked={selected.includes(option.id)}
                onCheckedChange={(checked) =>
                  setSelected((prev) =>
                    checked ? [...prev, option.id] : prev.filter((id) => id !== option.id),
                  )
                }
              />
              <Label htmlFor={`${item.id}-${option.id}`}>{option.text}</Label>
            </div>
          ))}
        </div>
      ) : (
        <RadioGroup value={selected[0] ?? ""} onValueChange={(value) => setSelected([value])}>
          {options.map((option) => (
            <div key={option.id} className="flex items-center gap-2">
              <RadioGroupItem value={option.id} id={`${item.id}-${option.id}`} />
              <Label htmlFor={`${item.id}-${option.id}`}>{option.text}</Label>
            </div>
          ))}
        </RadioGroup>
      )}
      <CardFooter className="px-0 pt-4 pb-0">
        <Button onClick={() => setResult(scoreItem(item, { selectedOptionIds: selected }))}>
          Submit
        </Button>
      </CardFooter>
      {result && <ScoreResult item={item} result={result} />}
    </>
  );
}

function SelectionGridBody({ item }: ExampleProps<SelectionGridItem>) {
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<ItemScoreResult | null>(null);

  return (
    <>
      <p className="mb-3">{item.payload.prompt}</p>
      <div className="space-y-3">
        {item.payload.rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-4">
            <span>{row.statement}</span>
            <RadioGroup
              className="grid-flow-col gap-4"
              value={answers[row.id] === undefined ? "" : String(answers[row.id])}
              onValueChange={(value) =>
                setAnswers((prev) => ({ ...prev, [row.id]: value === "true" }))
              }
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="true" id={`${row.id}-true`} />
                <Label htmlFor={`${row.id}-true`}>True</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="false" id={`${row.id}-false`} />
                <Label htmlFor={`${row.id}-false`}>False</Label>
              </div>
            </RadioGroup>
          </div>
        ))}
      </div>
      <CardFooter className="px-0 pt-4 pb-0">
        <Button
          onClick={() =>
            setResult(
              scoreItem(
                item,
                Object.entries(answers).map(([rowId, answer]) => ({ rowId, answer })),
              ),
            )
          }
        >
          Submit
        </Button>
      </CardFooter>
      {result && <ScoreResult item={item} result={result} />}
    </>
  );
}

function OrderingBody({ item }: ExampleProps<OrderingItem>) {
  const shuffledIndices = useMemo(
    () => shuffleOrderingIndices(item.payload.elements.length, ATTEMPT_ID, item.id),
    [item],
  );
  const initialPool = shuffledIndices.map((i) => item.payload.elements[i].id);
  const [pool, setPool] = useState<string[]>(initialPool);
  const [chosen, setChosen] = useState<string[]>([]);
  const [result, setResult] = useState<ItemScoreResult | null>(null);

  const byId = (id: string) => item.payload.elements.find((el) => el.id === id)!;

  return (
    <>
      <p className="mb-3">{item.payload.prompt}</p>
      <div className="flex flex-wrap gap-2 min-h-10 rounded-md border border-dashed p-2">
        {chosen.length === 0 && <span className="text-sm text-muted-foreground">Tap words below, in order.</span>}
        {chosen.map((id) => (
          <Badge key={id} variant="secondary">
            {byId(id).text}
          </Badge>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {pool.map((id) => (
          <Button
            key={id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setPool((prev) => prev.filter((p) => p !== id));
              setChosen((prev) => [...prev, id]);
            }}
          >
            {byId(id).text}
          </Button>
        ))}
      </div>
      <CardFooter className="px-0 pt-4 pb-0 gap-2">
        <Button onClick={() => setResult(scoreItem(item, { order: chosen }))}>Submit</Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setPool(initialPool);
            setChosen([]);
            setResult(null);
          }}
        >
          Reset
        </Button>
      </CardFooter>
      {result && <ScoreResult item={item} result={result} />}
    </>
  );
}

function MatchingBody({ item }: ExampleProps<MatchingItem>) {
  const rightOptions = useMemo(
    () => shuffleForItem(item.payload.right, ATTEMPT_ID, item.id),
    [item],
  );
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ItemScoreResult | null>(null);

  const label = (content: (typeof item.payload.left)[number]["content"]) =>
    content.kind === "text" ? content.text : content.alt;

  return (
    <>
      <p className="mb-3">{item.payload.prompt}</p>
      <div className="space-y-3">
        {item.payload.left.map((leftEl) => (
          <div key={leftEl.id} className="flex items-center gap-3">
            <span className="w-48 shrink-0">{label(leftEl.content)}</span>
            <Select
              value={pairs[leftEl.id] ?? ""}
              onValueChange={(value) => setPairs((prev) => ({ ...prev, [leftEl.id]: value }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a match" />
              </SelectTrigger>
              <SelectContent>
                {rightOptions.map((rightEl) => (
                  <SelectItem key={rightEl.id} value={rightEl.id}>
                    {label(rightEl.content)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <CardFooter className="px-0 pt-4 pb-0">
        <Button
          onClick={() =>
            setResult(
              scoreItem(
                item,
                Object.entries(pairs).map(([left, right]) => ({ left, right })),
              ),
            )
          }
        >
          Submit
        </Button>
      </CardFooter>
      {result && <ScoreResult item={item} result={result} />}
    </>
  );
}

function SlotsBody({ item }: ExampleProps<SlotsItem>) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ItemScoreResult | null>(null);

  return (
    <>
      <p className="mb-3">{item.payload.prompt}</p>
      <div className="space-y-3">
        {item.payload.gaps.map((gap, index) => (
          <div key={gap.id} className="flex items-center gap-2">
            <Label htmlFor={gap.id} className="w-16 shrink-0">
              Gap {index + 1}
            </Label>
            <Input
              id={gap.id}
              value={answers[gap.id] ?? ""}
              onChange={(e) => setAnswers((prev) => ({ ...prev, [gap.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <CardFooter className="px-0 pt-4 pb-0">
        <Button
          onClick={() =>
            setResult(
              scoreItem(
                item,
                item.payload.gaps.map((gap) => ({ gapId: gap.id, answer: answers[gap.id] ?? "" })),
              ),
            )
          }
        >
          Submit
        </Button>
      </CardFooter>
      {result && <ScoreResult item={item} result={result} />}
    </>
  );
}

function ExampleCard({ label, item }: { label: string; item: Item }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>id: {item.id}</CardDescription>
      </CardHeader>
      <CardContent>
        {item.type === "selection" && <SelectionBody item={item} />}
        {item.type === "selection_grid" && <SelectionGridBody item={item} />}
        {item.type === "ordering" && <OrderingBody item={item} />}
        {item.type === "matching" && <MatchingBody item={item} />}
        {item.type === "slots" && <SlotsBody item={item} />}
      </CardContent>
    </Card>
  );
}

export function ItemPlaygroundClient({ examples }: { examples: { label: string; item: Item }[] }) {
  return (
    <div className="space-y-6">
      {examples.map(({ label, item }) => (
        <ExampleCard key={item.id} label={label} item={item} />
      ))}
    </div>
  );
}
