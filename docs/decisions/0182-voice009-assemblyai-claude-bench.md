# 0182 — VOICE-009: AssemblyAI and Claude measured on owner takes

Status: measured 2026-10-21 (VOICE-009, #229). Spend approved by the owner before
the runs (cap $3); spent $0.58. The Vercel limit was measured on a preview
deployment. Every figure below is copied from the printed output of
`scripts/voice-bench-stt.ts` and `scripts/voice-bench-claude.ts`; the runs' JSON
lines are reproduced by re-running those scripts on the same files.

## Context

0156 Decision 4 chose AssemblyAI for speech-to-text and `claude-sonnet-5-5` for
the analysis, and asked VOICE-009 to measure fit before anything is built: the
fillers and false starts must survive, the cost must fit Decision 6's caps, and
the worst case must fit Vercel's duration limit without a webhook (0156 "Design
notes").

### The takes, and what the owner relaxed (2026-10-21)

The owner supplied three takes, each named for the speaker's expected level:
`public/audio/A2.MP3` (62.8 s), `A2-B1.MP3` (52.7 s), `B1-B2.MP3` (81.4 s)
(durations from an ffmpeg decode). The card asked for 60, 180 and 600 s takes
recorded in webm, ogg and mp4, and the owner relaxed that in this session:

- **Formats:** each take was transcoded with ffmpeg 6.0 (run from the
  scratchpad, not a repo dependency) to webm/opus 48 kb/s mono (Chrome's
  recorder), ogg/opus (Firefox) and mp4/AAC 64 kb/s (Safari). These are
  transcodes, not browser recordings.
- **Lengths:** the 180 s and 600 s takes are the three takes concatenated (and
  looped, for 600 s) and cut. They are one voice repeating itself, not a person
  talking for ten minutes.
- **No answer key.** The owner skipped the verbatim reference transcripts and
  error labels. Word error rate, filler recall and error recall are therefore
  **not measured**. Error precision below is the session's own reading of the
  flagged errors, labelled as such, not a measurement against a key.
- **B1-B2 is probably read aloud** (it ends "Share your experience in the
  comments"): an assumption from the text, not checked with the owner. Its 0
  fillers says nothing about how a B1-B2 speaker improvises.
- **Expression list bias:** the eight bench "Expressions to listen for" were
  chosen by this session, and five of them occur in the B1-B2 text. The
  "expressions used" figures are inflated for that take.

## Measurements

### AssemblyAI (EU endpoint `api.eu.assemblyai.com`, `disfluencies: true`, `language_code: "en"`)

25 jobs, 2,832 s of audio, $0.1486.

| | Universal-3.5 Pro | Universal-2 |
|---|---|---|
| Price (pricing page, read 2026-10-21) | $0.21/hr | $0.15/hr |
| Short takes: time to transcript p50 / max | 6.01 s / 7.78 s (n=15) | 3.52 s / 4.07 s (n=6) |
| Real-time factor, mean (short takes) | 0.094 | 0.053 |
| 180 s take | 5.84 s | not run |
| 600 s take | 10.6 s (upload 0.34 s) | 9.67 s |
| Mean word confidence A2 / A2-B1 / B1-B2 (MP3) | 0.930 / 0.941 / 0.974 | 0.968 / 0.973 / 0.970 |
| Fillers kept A2 / A2-B1 / B1-B2 (MP3) | 4 / 9 / 0 | 7 / 11 / 1 |
| Repeats kept A2 / A2-B1 / B1-B2 (MP3) | 0 / 5 / 0 | 0 / 0 / 0 |
| webm / ogg / mp4 accepted | all three, same fillers, repeats within 1 | webm only run |

**The false starts survive on Universal-3.5 Pro and are removed by Universal-2.**
The same A2-B1 audio reads:

- 3.5 Pro: "I made I made my mind… in this in the school… I learned I learned
  German… or uh or I might understand that uh English is is the language of the
  international of the international communications."
- Universal-2: "I made my mind… in the school… I learned German… Or I might
  understand that English, uh, is the language of the International
  Communications." Universal-2 also turned "sauna" into "the sa".

Universal-2 keeps more fillers (11 vs 9 on A2-B1), so neither model keeps
everything. The 0156 stop condition ("AssemblyAI drops the disfluencies") did not
fire: fillers and restarts both reach the transcript on Universal-3.5 Pro.

**Filler capture is not reproducible.** The same A2-B1 audio got 9 fillers
alone, and 8, 7, 5 and 6 when it sat inside the 180 s and 600 s files (per
looped copy, counted by word timestamps). A2 got 4 alone and 3, 3, 4, 3 inside
them. Repeats were stable: 15 in 600 s = 3 × 5.

**Deletion.** For all 25 jobs, DELETE returned 200 and the GET afterwards
returned **200, not the 404 the card expected**, with `text: "Deleted by user."`
and `words: null`. The record stays, its content is gone. AssemblyAI's DELETE
docs say files uploaded via `/v2/upload` "are immediately deleted alongside the
transcript".

**EU processing: an open question.** `/v2/upload` on the EU endpoint returned
`audio_url`s on `cdn.assemblyai.com`. `nslookup` gives that host as an alias of
`cdn.assemblyai.com.s3.us-west-2.amazonaws.com`, and a GET to it presented an S3
us-west-2 certificate (`ERR_TLS_CERT_ALTNAME_INVALID`). **Hypothesis, not
verified:** audio sent through `/v2/upload` is stored in the US even when the
transcript is processed in the EU. It is the reason for Decision 2.

### Claude (`claude-sonnet-5-5`, `messages.parse` + Zod, cached system block, `fallbacks: "default"`)

Instructions: `prompts/voice-analysis/first-v0.md` (2,037 cached tokens) and
`final-v0.md` (2,254). Five cases: `first` on each take, `final` A2 → A2-B1 and
A2-B1 → B1-B2, three runs each per effort; plus two `first` runs on the 600 s
transcript. 32 calls, $0.4279.

| | effort `high` (default) | effort `low` |
|---|---|---|
| Calls | 15 | 15 |
| Latency p50 / max | 12.2 s / 19.3 s | 6.0 s / 6.8 s |
| Output tokens, mean | 1,463 | 696 |
| Cost per analysis, mean / max | $0.0165 / $0.0259 | $0.0082 / $0.0097 |
| Uncached input tokens | 236–659 | 236–659 |
| Schema-valid (`parsed_output` not null) | 15 / 15 | 15 / 15 |
| Refusals / fallbacks used | 0 / 0 | 0 / 0 |
| Quotes found verbatim (exact substring) | 147 / 147 | 156 / 156 |
| Errors flagged, total | 45 | 56 |
| Errors flagged that this session reads as wrong or doubtful | 3 | 15 |
| Same main error in all 3 runs | 5 of 5 (4 with the identical quote) | 4 of 5 (2 with the identical quote) |

The first call per instruction wrote the cache (2,037 / 2,254 tokens) and every
later call read it. Across all 32 calls, 335 of 335 quotes were found verbatim.

Errors per 100 words (high, per case): A2 4.5–6.1, A2-B1 4.6, B1-B2 0.5. They
rank the takes in their named order. Three takes are not enough to call that a
level signal, and it is never shown to a learner.

**What `high` flagged that this session doubts:** "it was very fun" → "a lot of
fun" (twice), and "I saved 1 month's salary" → "I had saved" (once). `low` also
flagged "my elder sister" → "older sister" (four times) and "in an application"
→ "in an app" (twice), and turned the machine's sentence break "And lived with
constant anxiety" into an error. Those are false corrections, the case the
instruction says costs most. **Missed by `high`, caught by `low`:** "I had a fun
time together" → "We had".

**600 s take (high, 2 runs):** 18.9 s and 16.4 s, $0.0294 and $0.0274, input
2,009 tokens, output 2,501 and 2,293, 32 of 32 quotes verbatim. It flagged 5 and
6 errors. The `high` runs on the three short takes inside it found 4, 5 and 1–2
distinct errors, so the long analysis found about half. Long takes lose recall.

**Transcription errors become the learner's errors.** Two of the 600 s
analysis's errors were made by the transcriber, not the speaker. The same audio
reads "sometimes ran out of money" in all four short transcripts and in two of
the three looped copies, and "sometimes run out of money" in the third; "I had a
fun time" became "I had the fun time" in two copies of three. Claude flagged
"run" → "ran" and "the fun time" → "a fun time" as the learner's mistakes. The
disputed words carry word confidence 0.50–0.76, in the transcript's bottom 10%
(p10 0.77, p25 0.98). The right versions score no higher ("ran" 0.51 and 0.61,
"a" 0.64): confidence marks a word as uncertain, it does not say which reading
is right.

## Scorecard

| Metric | Value | Source |
|---|---|---|
| STT cost per minute (3.5 Pro, EU) | $0.0035 | pricing page; billed seconds above |
| Analysis cost per take, `high` | $0.0165 mean, $0.0259 max | Claude table |
| **Total per 60 s take, `high`** | **≈ $0.020** (Claude ≈ 83%) | sum |
| Total per 60 s take, `low` | ≈ $0.012 | sum |
| Per 1,000 takes, `high` | ≈ $20 | × 1,000 |
| Learner at the 10/day cap (0156 D6), `high`, 60 s takes | ≈ $0.20/day | × 10 |
| Course with 5 voice tasks × 3 analysed sends (the per-task cap) | ≈ $0.30 per learner, worst case | × 15 |
| Same course, one send per task | ≈ $0.10 per learner | × 5 |
| Worst case end to end (600 s): upload + STT + analysis | 0.34 + 10.6 + 18.9 ≈ 30 s | tables above |
| `after()` work on a preview, no `maxDuration` | alive at 280 s, gone by 331 s (documented default 300 s) | Vercel section |
| Disfluencies survive | yes, 3.5 Pro; Universal-2 removes false starts | AssemblyAI section |
| Filler count reproducibility | ±40% on identical audio | AssemblyAI section |
| Quotes verbatim | 335 / 335 | Claude section |
| Error precision (session's reading, no key) | high ≈ 42/45, low ≈ 41/56 | Claude section |
| Errors that were transcription mistakes | 4 of 11 flags (2 distinct) on the 600 s take; short takes not checkable without a reference | Claude section |
| WER, filler recall, error recall | not measured (no answer key) | owner, 2026-10-21 |
| Deletion | 200 then 200 "Deleted by user.", not 404 | AssemblyAI section |
| Audio stays in the EU | unresolved: upload CDN is S3 us-west-2 | AssemblyAI section |

## Decisions

Made unattended under the card; each is a recommendation for VOICE-010..016.

1. **Universal-3.5 Pro, not Universal-2.** The analysis highlights false starts
   ("I go, I went"), and Universal-2 deletes them. The 40% higher price is
   $0.001 a minute.
2. **Never use `/v2/upload`.** Pass a short-lived Supabase signed URL as
   `audio_url` instead, so the audio never lands on AssemblyAI's us-west-2 CDN.
   It also removes the upload round trip. OPS-026 has to get AssemblyAI's written
   answer on where EU-endpoint jobs store audio before go-live; this bench could
   not settle it.
3. **Deletion is "200, then GET shows `Deleted by user.`".** The erasure code
   checks for that, not for a 404. AssemblyAI keeps the transcript ID. Whether
   other request fields (a webhook URL, say) survive the DELETE was not checked,
   so nothing sent to AssemblyAI carries a learner ID.
4. **Effort `high` for the analysis.** `low` costs half as much and is twice as
   fast, but made 15 doubtful corrections where `high` made 3, and "a false
   correction does more harm than a missed one" is the instruction's own rule.
   At ≈ $0.02 per take the difference is $0.008.
5. **Cap the analysed length at 180 s.** The cap is on what is sent to the
   analysis, not on what the learner may record. Time is not the reason: 600 s
   fits in 30 s. Quality is: the 600 s analysis found about half the errors, two
   of its errors were transcription mistakes, and filler capture fell inside long
   files. A longer take still uploads and is still the learner's; the analysis
   covers its first 180 s and says so. Revisit with a real long take.
6. **No webhook.** The worst case is about 30 s of `after()` work, and on the
   preview `after()` work was still running at 280 s and gone by 331 s (see
   "Vercel"). The upload route needs no `maxDuration` export. 0156's lease and
   status route cover a stall or a queue delay at AssemblyAI, which this bench
   never saw (every job finished in under 11 s). Because runtime logs dropped
   every line written after the response, the pipeline records each step in its
   database row and never relies on logs.
7. **Never show a filler count as a number** in the before/after comparison.
   It moved ±40% on identical audio. Show quotes ("uh uh uh") or a coarse word
   (more, fewer, about the same) only when the difference is large.
8. **`then_now` needs the same task both times.** On the bench's different-topic
   pairs, the model sometimes forced a pair ("I made I made my mind" →
   "I realized I didn't want to live like this anymore") and sometimes returned
   none. In production `before` and `after` share a prompt (0156 Decision 8), so
   this is expected; the shipped instruction keeps "empty rather than forced".
9. **Model ID `claude-sonnet-5-5`, in `ANTHROPIC_MODEL_VOICE`.** The owner first
   wrote `sonnet_5_5` into `ANTHROPIC_MODEL_GENERATOR`, which
   `lib/generator/llm.ts` reads for Colloquiz questions; the voice model has its
   own variable.
10. **Low-confidence words do not become errors.** Before an error is shown, we
    check the transcript words its quote covers: if a word the correction
    changes has confidence below 0.8, the error is withheld (or the instruction
    receives those words marked as uncertain, VOICE-010's choice). 0.8 sits just
    above this transcript's p10 (0.77) and above every disputed word measured
    (0.50–0.76); it is a starting value from one file, not a tuned one.
11. **`fallbacks: "default"` works on SDK 0.104.1 with a cast.** The SDK types
    only the array form and the `-2026-06-01` beta; the API accepted the scalar
    form with `server-side-fallback-2026-07-01` on all 32 calls. Drop the cast
    when the SDK catches up.

## Vercel

Documented: work passed to `waitUntil`, which Next's `after()` uses on Vercel
(`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`,
"Platform Support"), has "the same timeout as the function itself" (Vercel
`@vercel/functions` reference). The function limit is 300 s by default on every
plan, and at most 300 s on Hobby or 800 s on Pro (Vercel "Configuring Maximum
Duration"). Both pages were read 2026-10-21.

Measured on two preview deployments of the working tree (region dub1, no
`maxDuration` export), with a temporary route that is not committed and has
been deleted. The route ticked every 10 s inside `after()` and kept its progress
in the instance's memory. A `?status=` request read it back, with the instance's
id, so a reply from a fresh instance shows.

- **Runtime logs drop lines written after the response.** Through
  `vercel logs` and the runtime-logs API alike, only each callback's first line
  appeared (`start`), for 1 s, 30 s, 60 s and 400 s probes alike, while the
  in-memory readings below show the ticks did run. So logs cannot show how long `after()` work
  ran, and VOICE-010 should record progress in the database, not in logs.
- **60 s run:** read every 13 s, it ticked 10, 20, 40, 50, 60 and finished, on
  one instance.
- **400 s run, unread until late** (so the readings could not keep it awake):
  at 280 s it was alive at its 280 s tick on the same instance. At 331 s and
  421 s the request reached a new instance, and the run was gone. The cut-off
  falls between 280 and 331 s, which fits the documented 300 s default.

Against the slowest take: the worst case measured here is 10.6 s of
transcription plus 18.9 s of analysis. That is a tenth of the 300 s default.

## Revisit when

- A real learner take (not a transcode, not a loop) disagrees with any figure
  here, particularly the 600 s recall drop or the ±40% filler variance.
- AssemblyAI confirms or denies that EU-endpoint audio stays in the EU (Decision 2).
- The owner supplies an answer key: then WER, filler recall and error precision
  and recall replace the session's reading.
- Free-funnel volume makes ≈ $0.02 a take matter (0156 "Revisit when").

Scorecard page (private until shared): https://claude.ai/artifact/V3MzJMMsj1DJ4z3yg9ncy1
