# Fiber360 Survey — design system

The survey app is a **field console**: a phone held in one hand, outdoors, by
someone wearing gloves, standing in a trench line. Everything here follows from
that sentence. It is not a dashboard that happens to be narrow.

## The world

Map first, chrome last.

- The map is the surface. Chrome floats over it only where it is earning its
  pixels: one 56 px header, one 38 px view switch, one layers chip, one control
  rail, one bottom dock.
- Every secondary surface is a **bottom sheet**, not a floating panel. Sheets
  arrive from the thumb, not from the top of the screen, and they leave the map
  exactly as the engineer left it.
- Colour is meaning, never decoration:
  - `#0D5CFF` (primary) — the designed network, HLD, and the app's own chrome.
  - `#FF8C00` (secondary / survey) — work in progress, the survey twin of a
    designed feature. Fills and geometry only; orange text uses `secondaryText`.
  - `#7C3AED` — overlay (HLD + survey at once).
  - `success` / `warning` / `error` — sync and validation state only.

## Type

`lib/theme/colors.ts` is the single type scale. The floor is **13 px**: nothing
a person must read is smaller. Rows that can grow do; ellipsised labels are
preferred over wraps in fixed-height chrome.

| Token | Size / weight | Use |
|---|---|---|
| `display` | 20 / 700 | screen titles, big numbers |
| `title` | 17 / 600 | sheet titles |
| `body` / `bodyStrong` | 15 / 400–600 | rows, project name |
| `label` | 13 / 600 | dock labels, segments, section headers |
| `meta` | 13 / 500 | counts, hints, timestamps |

## Space and touch

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32.
- **48 px** is the floor for any control. **56 px** is the primary action.
  Anything visually smaller gets `hitSlop` to reach 48.
- Radius: 6 (small chips) / 12 (controls) / 16 (cards) / 20 (sheets) / full.

## Map screen layout

```
┌─────────────────────────────────────────────┐
│ ←  Project name                    ▤   ⋮   │  56  MapHeader
│    ● 3 changes · HLD view                   │
├─────────────────────────────────────────────┤
│           [ HLD | Survey | Overlay ]        │  38  ViewModeSwitch (top 10)
│  ( Layers ●13 )                       [+]   │  40  chip (top 56) · rail (top 110)
│                                       [−]   │
│                MAP                    [L]   │
│                                       [⤢]   │
│                                             │
│  ┌───────── dock (5 slots, 68) ──────────┐  │
│  │ ⌖      ✎      ⊕      ↶      ☰        │  │
│  │Locate  Draw   Add    Undo   More     │  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│ ● 3 changes · 2 waiting      [ Submit ]     │  64  CommitBar compact
└─────────────────────────────────────────────┘
```

Every number above lives in `lib/theme/chrome.ts` (`Layout`), because the
camera has to know them too: `FRAME_PADDING` keeps the framed region clear of
the header, the dock and the commit bar.

### Dock

Five slots, fixed order, always visible unless a contextual toolbar owns the
bottom strip:

`Locate · Draw trench · Add point · Undo · More`

The dock replaces the old "+" FAB that unfolded into eight labelled rows over
the map. Undo and locate now cost zero taps.

### Sheets

`MapSheet` (`lib/components/map/MapSheet.tsx`) is the only sheet primitive:
scrim, grabber, title, subtitle, close, scroll body, optional footer. Tools,
Layers and Basemap are built on it. One sheet is open at a time.

### Layers

The layer tree is a sheet (`LayersSheet`), not a floating legend. 52 px group
headers, 56 px rows, 26 px checkboxes in 44 px hit areas, counts at 13 px. The
map keeps its area; the tree appears when layers are what you are changing.

## Auto-zoom

All camera decisions go through `lib/utils/autozoom.ts`. There are exactly four
moments the map moves on its own:

1. **First frame** — the project's visible layers are fitted once, with
   chrome-aware padding. Never again for that project unless asked.
2. **Select a feature** — only if its centre is off screen (1.5× slack) or it
   occupies less than a third of the viewport. A tap on a neighbour at working
   zoom does not move the map.
3. **Frame the survey area** — the rail's ⤢ button; always fits, ignoring the
   `needsReframe` guard.
4. **Locate** — the dock's ⌖ button flies to the GPS fix at z18 and follows it.

Points and stubs are expanded to a 60 m minimum span before framing, so a tap
on a chamber never lands at z19 on a 2 m view.

## Motion

- Camera: 900 ms fit, 1200 ms project fly, 280 ms rail zoom.
- Sheets: 220 ms translate-up with `Easing.out(Easing.cubic)`.
- Press feedback: a tile tint, no scale bounce. Nothing moves under a thumb
  that is trying to hit a target.

## Rules that must not be re-broken

1. No floating panel larger than a chip on the map. If it has more than three
   rows, it is a sheet.
2. No control under 48 px, no readable text under 13 px.
3. No chrome that covers the dock or the commit bar.
4. Selection never re-centres a feature that is already readable.
5. Orange is work-in-progress, blue is the design. Never swap them.
