import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDay, formatMonth, formatUsd } from "./format";
import type { ReportModel } from "./reportModel";
import { CATEGORY_LABELS, FEATURE_LABELS, PROVIDER_LABELS } from "./types";

/**
 * The sponsor report's layout (OPS-033, docs/decisions/0207 Decision 8). Server-only by use: the
 * only importer is the admin route app/api/studio/costs/report, so @react-pdf/renderer reaches no
 * English route. PT Sans (SIL OFL, assets/fonts) is embedded so Cyrillic in a vendor or note
 * prints; the default PDF fonts have no Cyrillic.
 */

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
Font.register({
  family: "PT Sans",
  fonts: [
    { src: path.join(FONT_DIR, "PT_Sans-Web-Regular.ttf"), fontWeight: 400 },
    { src: path.join(FONT_DIR, "PT_Sans-Web-Bold.ttf"), fontWeight: 700 },
  ],
});
// A long invoice URL or reference has no break point; break it by character rather than overflow.
Font.registerHyphenationCallback((word) => (word.length > 24 ? word.split("") : [word]));

// A PDF has no CSS variables; named colours keep the hex-literal guard honest.
const INK = "black";
const MUTED = "dimgray";
const RULE = "silver";

const s = StyleSheet.create({
  page: { fontFamily: "PT Sans", fontSize: 9.5, color: INK, padding: 40, paddingBottom: 56 },
  h1: { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  h2: { fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 6 },
  muted: { color: MUTED },
  small: { fontSize: 8.5, color: MUTED, marginTop: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: RULE, paddingVertical: 3 },
  head: { fontWeight: 700, borderBottomWidth: 1, borderBottomColor: INK },
  total: { fontWeight: 700, borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: INK },
  num: { textAlign: "right" },
  tiles: { flexDirection: "row", gap: 10, marginTop: 12 },
  tile: { flex: 1, borderWidth: 0.5, borderColor: RULE, padding: 8 },
  tileValue: { fontSize: 16, fontWeight: 700 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: MUTED, flexDirection: "row", justifyContent: "space-between" },
});

function Table({ widths, head, rows, foot }: { widths: number[]; head: string[]; rows: string[][]; foot?: string[] }) {
  const cell = (text: string, i: number, key: string, numeric: boolean) => (
    <Text key={key} style={[{ width: `${widths[i]}%`, paddingRight: 4 }, numeric ? s.num : {}]}>
      {text}
    </Text>
  );
  // Columns after the first are right-aligned only when they hold money; a header ending in "#" marks a money/number column.
  const isNum = (h: string) => h.endsWith("#");
  const label = (h: string) => (isNum(h) ? h.slice(0, -1) : h);
  return (
    <View>
      <View style={[s.row, s.head]} wrap={false}>
        {head.map((h, i) => cell(label(h), i, `h${i}`, isNum(h)))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={s.row} wrap={false}>
          {r.map((c, i) => cell(c, i, `${ri}-${i}`, isNum(head[i])))}
        </View>
      ))}
      {foot && (
        <View style={[s.row, s.total]} wrap={false}>
          {foot.map((c, i) => cell(c, i, `f${i}`, isNum(head[i])))}
        </View>
      )}
    </View>
  );
}

function periodLabel(m: ReportModel): string {
  const first = m.months[0]?.month;
  const last = m.months[m.months.length - 1]?.month;
  return first === last ? formatMonth(first) : `${formatMonth(first)} to ${formatMonth(last)}`;
}

export function SponsorReport({ model }: { model: ReportModel }) {
  const { summary } = model;
  const topups = summary.paid.expenses.filter((e) => e.kind === "credit_topup");

  return (
    <Document title={`Expenses report, ${periodLabel(model)}`} author="Colloquiz" creator="Colloquiz">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Expenses report</Text>
        <Text style={s.muted}>
          {periodLabel(model)} · prepared {formatDay(model.generatedOn)} · all amounts in US dollars
        </Text>

        <View style={s.tiles}>
          <View style={s.tile}>
            <Text style={s.muted}>Paid</Text>
            <Text style={s.tileValue}>{formatUsd(summary.paid.total)}</Text>
            <Text style={s.small}>
              Bills {formatUsd(summary.paid.bills)} · credit top-ups {formatUsd(summary.paid.topups)}
            </Text>
          </View>
          <View style={s.tile}>
            <Text style={s.muted}>Used (estimate)</Text>
            <Text style={s.tileValue}>{formatUsd(summary.usage.usd)}</Text>
            <Text style={s.small}>{summary.usage.calls} provider calls at list price</Text>
          </View>
        </View>
        <Text style={s.small}>
          &ldquo;Paid&rdquo; is money that left the project. &ldquo;Used&rdquo; is what the app consumed from AI and
          speech providers, mostly paid for in advance by the credit top-ups, so the two are never added together.
        </Text>

        <Text style={s.h2}>Paid, by month and category</Text>
        {summary.paid.expenses.length === 0 ? (
          <Text style={s.muted}>No expenses were entered for this period.</Text>
        ) : (
          <Table
            widths={[18, ...model.categories.map(() => 68 / model.categories.length), 14]}
            head={["Month", ...model.categories.map((c) => `${CATEGORY_LABELS[c]}#`), "Total#"]}
            rows={model.months.map((m) => [
              formatMonth(m.month),
              ...model.categories.map((c) => (m.byCategory[c] ? formatUsd(m.byCategory[c]) : "—")),
              formatUsd(m.paid),
            ])}
            foot={[
              "Total",
              ...model.categories.map((c) => formatUsd(summary.paid.byCategory.find((x) => x.category === c)?.usd ?? 0)),
              formatUsd(summary.paid.total),
            ]}
          />
        )}

        <Text style={s.h2}>Every expense</Text>
        {summary.paid.expenses.length === 0 ? (
          <Text style={s.muted}>None.</Text>
        ) : (
          <>
            <Table
              widths={[13, 20, 13, 29, 11, 14]}
              head={["Date", "Vendor", "Category", "Reference and note", "Kind", "Amount#"]}
              rows={summary.paid.expenses.map((e) => [
                formatDay(e.incurredOn),
                e.vendor,
                CATEGORY_LABELS[e.category],
                [e.reference, e.note, e.periodStart && e.periodEnd ? `covers ${formatDay(e.periodStart)} to ${formatDay(e.periodEnd)}` : null]
                  .filter(Boolean)
                  .join(" · ") || "—",
                e.kind === "bill" ? "Bill" : "Credit top-up",
                formatUsd(e.amountUsd),
              ])}
              foot={["Total", "", "", "", "", formatUsd(summary.paid.total)]}
            />
            {topups.length > 0 && (
              <Text style={s.small}>
                Credit top-ups ({formatUsd(summary.paid.topups)}) are prepaid balance with a provider; the usage below is
                drawn from it.
              </Text>
            )}
          </>
        )}

        <Text style={s.h2}>Usage estimate</Text>
        {summary.usage.calls === 0 ? (
          <Text style={s.muted}>No provider calls were recorded in this period.</Text>
        ) : (
          <>
            <Table
              widths={[34, 22, 22, 22]}
              head={["Feature", "Calls#", "Priced usage#", "Per Claude call#"]}
              rows={summary.usage.byFeature.map((f) => [
                FEATURE_LABELS[f.feature],
                `${f.modelCalls + f.transcripts}`,
                formatUsd(f.usd),
                f.perModelCall === null ? "—" : formatUsd(f.perModelCall),
              ])}
              foot={["Total", `${summary.usage.calls}`, formatUsd(summary.usage.usd), ""]}
            />
            <View style={{ marginTop: 10 }}>
              <Table
                widths={[34, 22, 44]}
                head={["Provider", "Calls#", "Priced usage#"]}
                rows={summary.usage.byProvider.map((p) => [PROVIDER_LABELS[p.provider], `${p.calls}`, formatUsd(p.usd)])}
              />
            </View>
          </>
        )}
        <Text style={s.small}>
          Method: each call the app made is recorded without any user or content (tokens, or audio seconds for speech),
          and priced at the provider&rsquo;s published list price for its model. Failed calls are included. The figure is
          an estimate of consumption, not an invoice.
          {model.ledgerStart
            ? ` The record starts on ${formatDay(model.ledgerStart)}; nothing before it is counted.`
            : " The record is empty."}
        </Text>
        {model.rates.map((r) => (
          <Text key={`${r.provider}:${r.model}`} style={s.small}>
            {PROVIDER_LABELS[r.provider as keyof typeof PROVIDER_LABELS]} {r.model}: {r.text} (as read on{" "}
            {formatDay(model.pricesReadOn)}).
          </Text>
        ))}

        {(summary.usage.unpriced.length > 0 || summary.usage.unknownCalls > 0) && (
          <View wrap={false}>
            <Text style={s.h2}>Not in the estimate</Text>
            {summary.usage.unpriced.map((u) => (
              <Text key={`${u.provider}:${u.model}`}>
                {u.calls} {u.calls === 1 ? "call" : "calls"} to {u.model} ({PROVIDER_LABELS[u.provider]}), which has no price
                in the app.
              </Text>
            ))}
            {summary.usage.unknownCalls > 0 && (
              <Text>
                {summary.usage.unknownCalls} failed {summary.usage.unknownCalls === 1 ? "call" : "calls"}{" "}
                whose size the provider&rsquo;s library did not keep.
              </Text>
            )}
            <Text style={s.small}>These are counted above as calls but add nothing to the priced usage.</Text>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>Expenses report · {periodLabel(model)}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
