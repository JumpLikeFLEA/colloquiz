import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getCourseAccess } from "@/lib/courseAccess";
import { monthsIn, monthsPeriod } from "@/lib/costs/period";
import { PRICES_READ_ON } from "@/lib/costs/prices";
import { SponsorReport } from "@/lib/costs/reportDocument";
import { buildReportModel } from "@/lib/costs/reportModel";
import { getExpenses, getLedgerStart, getUsage } from "@/lib/costs/server";

/** The longest period one report covers, in months. */
const MAX_MONTHS = 24;

/**
 * OPS-033 (docs/decisions/0207 Decision 8) — GET ?from=YYYY-MM&to=YYYY-MM: the sponsor report as
 * a PDF, built from the same summary as /studio/costs. Admin only; the RPCs it reads (104, 105)
 * raise for anyone else too, so this check picks the status code and is not the only gate.
 */
export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const access = await getCourseAccess();
  if (!access.isAdmin) return NextResponse.json({ error: "Only an admin can download the report." }, { status: 403, headers });

  const params = request.nextUrl.searchParams;
  const period = monthsPeriod(params.get("from") ?? "", params.get("to") ?? "");
  if (!period) return NextResponse.json({ error: "Choose a period: from and to as YYYY-MM, from not after to." }, { status: 400, headers });
  const months = monthsIn(period);
  if (months.length > MAX_MONTHS) {
    return NextResponse.json({ error: `A report covers at most ${MAX_MONTHS} months.` }, { status: 400, headers });
  }

  let model;
  try {
    const [usage, expenses, ledgerStart] = await Promise.all([getUsage(period), getExpenses(), getLedgerStart()]);
    model = buildReportModel({
      period,
      usage,
      expenses,
      ledgerStart,
      generatedOn: new Date().toISOString().slice(0, 10),
      pricesReadOn: PRICES_READ_ON,
    });
  } catch (error) {
    console.error("costs report: read failed", error);
    return NextResponse.json({ error: "Could not read the figures." }, { status: 500, headers });
  }

  const pdf = await renderToBuffer(SponsorReport({ model }));
  const name = `expenses-${months[0]}${months.length > 1 ? `_${months[months.length - 1]}` : ""}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
