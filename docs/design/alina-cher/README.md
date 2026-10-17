# Alina Cher design assets (owner-supplied)

Source files for the redesign in docs/decisions/0156. They are stored verbatim
as the owner sent them, and nothing in the app serves them from here. The card
that uses an asset decides how it reaches the page.

| File | Received | Used by | What it is |
|---|---|---|---|
| `dino-big.svg` | 2026-10-17 | SHELL-027 | Comic panel, top left: "English in my head" / "английский в моей голове". A big dinosaur roaring, with violet sound lines. |
| `dino-small.svg` | 2026-10-17 | SHELL-027 | Comic panel, bottom left: "English I speak" / "английский, когда говорю". A small dinosaur with a sweat drop. The "uhh… um" / "ээ...мм" speech bubble is not in the file. |
| `alina-photo.png` | 2026-10-17 | SHELL-027 | Alina's photo for the hero bio block. Portrait, 1080 × 1920 PNG, 1.65 MB, kept as the original. The design shows it as a circle. SHELL-027 crops it to the face and serves a small square copy from `public/images/` through next/image; this original is never served. |

Colours hardcoded in the SVGs, as sent (the owner's design values):

| Hex | Role in the art |
|---|---|
| `#1E1A3A` | ink (outlines, eye) |
| `#5B3FD9` | violet (sound lines, drop) |
| `#E4DEF9` | big dinosaur's fill |
| `#F3F0FC` | small dinosaur's fill |
| `#DCD5F7` | drop's fill |

They are inputs for VIS-003 and SHELL-026, which define the violet and ink
tokens. The hex-literal guard (`scripts/check-hex-literals.mjs`) covers `app/`
and `lib/`. If SHELL-027 inlines these drawings as components, the colours
become tokens (or `currentColor`) rather than being copied in as literals.

Still to come from the owner:
- The Day 1 / Day 7 audio clips (SHELL-030, in Hold until they arrive).
