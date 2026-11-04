# Motion: Agent Blueprint, Hosted page

Read this file in full before you design, generate or animate anything for the Hosted page. Every colour, font, timing and motion value comes from here. This file sets the look, not the ambition. Where it says ASK ME, stop and ask instead of choosing.

**Sources.** Five reference frames (01 to 05, kept in the design workspace, not in the repository) are the master look; there is one look, not several. Timings were measured frame by frame from the site's own videos in `site/public/media/` (`loop-workflow.mp4`, `loop-review.mp4`, `loop-runner.mp4`, `loop-waves.mp4`, `film.mp4`). The typed colours in the design workspace's brand notes win over anything sampled from a frame.

**The look in one line.** A technical drawing on paper that runs itself: hairline diagrams on a flat light ground, one accent element at a time, steady unhurried beats.

## 1. Colours

Light is the look in every frame.

| Hex | Name | What it is for, as the frames use it |
|---|---|---|
| `#fafafa` | Ground | The paper. Fills every frame edge to edge; diagrams sit straight on it with no card behind them. |
| `#0f0f0f` | Ink | Headings, finished states, primary lines (the stage line, the lead line), box outlines, filled path cells of the mark, the travelling squares, a parked marker dot. |
| `#383838` | Second ink | Body sentences (the line under a sheet title in frame 04) and captions (frame 02's bottom line). |
| `#555555` | Muted | Column headers and quiet secondary labels; a step that is done and has been passed. |
| `#b1b1b1` | Strong hairline | Waiting and not-yet states (a row before it runs), text at the start of its fade-in, connector curves, dashed and dotted construction lines, the outlined skipped cells of the mark on the film's end card. |
| `#d4d4d4` | Hairline | Dividers, table rules, sheet outlines and title-block cells, the outline of a panel that is not active. |
| `#ed4423` | Accent | The one active element in the frame, as a filled shape or stroke: the marker dot on the stage line (frame 01), the reviewer nodes while they work (frame 02), the branches of the wave that is running (frame 05), the last cell of the mark. Never more than one accent element at a time. |
| `#cf300c` | Accent fill | Accent words and thin accent outlines: a status word while it is live ("running"), a thin box around the one result that matters, an outlined badge. The frames never use it as a solid fill; where a solid area in it belongs: ASK ME. |
| `#f1f1f1` | Sunk surface | Not seen in the frames. Where it belongs: ASK ME. |
| `#ffffff` | Raised surface | Not seen in the frames. Where it belongs: ASK ME. |

**Dark theme** (the drawing in negative): ground `#0b0b0b`, ink `#f2f2f2`, accent `#f6623d`. No frame shows dark. Whether the Hosted pieces run in dark too, and the dark values for second ink, muted and the two hairlines: ASK ME.

**In-between tints are not colours.** A frame caught mid-fade shows a pale pink on a node (about `#ffe1e5`, frame 02) or a dark red on a changed value (about `#951a19`, frame 03). These exist only for the frames of a fade. Never hold them.

**Inactive panel grey.** Frame 03's pull request box, waiting its turn, reads about `#888888`, which no typed colour matches. Muted `#555555` or strong hairline `#b1b1b1`: ASK ME.

## 2. Fonts and type sizes

**Archivo**, variable, for every word on screen.
- **Display:** 118 percent width, weight 700 (600 for a quieter title). Sheet titles and the wordmark.
- **Headings and named labels:** 112 percent width, weight 600 to 700. Panel names and stage names ("Report", "Ledger", "Wave 1", "secret scan" in the frames).
- **Quiet labels:** 112 percent width, weight 400. Short notes on a line or beside a node.
- **Body:** 100 percent width, weight 400, in second ink. One sentence, never a paragraph.

**Azeret Mono** is for literal code only, and motion never shows code. The frames set many labels in mono ("lead", "integration check", "the change"); on the Hosted pieces those become Archivo quiet labels.

**Sizes**, measured from the frames and given for a 1920 by 1080 frame (scale with frame height):

| Role | Size at 1080 high | Share of frame height |
|---|---|---|
| Display (sheet title, wordmark) | about 110 to 115 px | about 10 percent |
| Heading | about 44 to 48 px | about 4 to 4.5 percent |
| Body sentence | about 30 px | about 2.8 percent |
| Label | about 20 to 24 px | about 2 percent; nothing smaller |

Text sits on the ground, left aligned, with wide empty space around it. A label never touches or crosses a line or a box edge.

## 3. Timing

All sources run at 30 fps.

**How things come in**
- **Lines draw along their path**, from the source end, in 0.3 to 0.5 s (sheet outline, branches, the baseline).
- **Text and marks fade in place**, from strong hairline grey to their final ink, in 0.2 to 0.33 s. Nothing slides or scales in.
- **Lists build top to bottom**, rows about 80 to 100 ms apart, each row fading grey to ink.
- **Order of a build:** frame first (outline, corner marks, title-block cells), then the title, then the content, then the caption. The film's opening sheet: outline and corner marks by about 0.25 s, title-block cells and baseline by 0.5 s, the title fading grey to ink from 0.75 to 1.0 s, index rows from 1.25 s.
- **A state change** (waiting, running, done) is a colour and weight change in place over about 0.3 s: grey, then accent while live, then ink when finished.

**How long things hold**
- **Beats inside a loop:** one change at a time, a new beat every 0.5 to 1.5 s.
- **Finished state of a loop:** holds 2.2 to 2.6 s with nothing moving.
- **A film sheet:** holds 5 to 6.5 s after it lands; its content builds in the first 2 to 3 s, then it rests.
- **The end card:** builds over about 4.5 s (pull-back to the overview, heading, list, mark cell by cell, wordmark fading grey to ink) and holds about 1.8 s after its last change.

**How things leave**
- **Loops:** everything fades back to the rest state together in about 0.4 s (accents clear, finished text returns to waiting grey), then rests about 0.5 s. The last frame matches the first, so the loop is seamless.
- **A finished step** dims to grey before the next step takes the accent (the stage line in frame 01).
- **Sheets** leave only by the camera panning on. Nothing scales down, slides out or flies off.

## 4. How things move

- **Frame rate:** 30 fps, smooth. No stepped or reduced frame rate.
- **Travel:** a small solid ink square carries a result along a line in about 1.0 s (frames 02 and 05). The stage marker steps between stops in about 0.3 s.
- **Camera:** flat and 2D. Horizontal pans from sheet to sheet take about 1.35 s; one pull-back to the overview of all sheets takes about 1.5 s. Neighbouring sheets move with the camera as one plane, no parallax, no rotation, no 3D.
- **Easing, measured on a pan:** a slow start over the first third of a second, a steady middle, and a soft landing over the last half second. It never passes its target. The named curves for pans and fades: ASK ME.
- **Direction:** left to right and top to bottom, following the drawing; a return path runs right to left along the bottom (frame 01's loop back to the start).
- **Handmade feel:** none. Motion is exact and mechanical, like a plotter: no jitter, no wobble, no hand-drawn wiggle. Precision is the craft.
- **One thing at a time:** a single accent element per frame; when it finishes it settles to ink and the accent moves on.

## 5. Texture and finish

- **Flat paper.** Solid `#fafafa` ground; no grain, noise, shadow, gradient, glow or blur.
- **Square corners.** Boxes are sharp rectangles.
- **Hairline strokes.** About 1 px for hairlines and 2 px for primary lines at 1920 by 1080.
- **Drawing-sheet details, as in the frames:** sheets framed with corner registration crosshairs and a title-block strip of cells (frame 04); a baseline with a marker under the sheets; nodes as small circles with a tick through them; optional items in a dashed outline (frame 01); checkpoints as dotted vertical lines (frame 05); small solid triangles for arrowheads; small solid squares for results in transit.
- **Empty space is part of the finish.** Diagrams use a fraction of the frame and leave the rest bare.
- **The logo** is used from its files exactly as they are, never redrawn. On the film's end card the mark builds cell by cell: ink cells first, outlined skipped cells, the last cell arriving in the accent.
- **Take the frames' look, never their words.** The frames carry skill names, file paths, JSON, task numbers and "Sheet 3 of 7"; all of that is out under section 6.

## 6. Never

1. No glow, glass, blur or gradients.
2. No window chrome (title-bar dots, tab bars, dark bars) and no fake terminals.
3. No bounce, elastic overshoot or spin.
4. No counts, code, commands, file paths or variable names on screen. Whether plain step numbers (frame 01's "1 Orient", frame 04's sheet numbers) count as counts: ASK ME.
5. No em or en dashes, and no text over a box edge.

## 7. One example, done right

An 8-second seamless loop, light theme, on the 1200 by 750 loop format the site already uses (the real size is still ASK ME). Its message: the same skills, on an account you own.

1. **0.0 to 0.4 s, rest.** Ground `#fafafa`. The heading "Hosted" in display, ink, top left. Below it the whole diagram already drawn in waiting grey: a node on the left labelled "the skills", one hairline running right to a split, three branches curving to three empty outlined panels labelled "Your Vercel account", "Railway" and "Your server". Nothing in accent.
2. **0.4 to 0.8 s.** The left node and its label fade from grey to ink, 0.3 s.
3. **0.8 to 1.8 s.** A small solid ink square travels from the node to the split along the line, 1.0 s, slow start and soft landing.
4. **1.8 to 2.4 s.** The three branches turn from grey to ink, each drawing along its length in 0.4 s, top branch first, 100 ms apart. The three panel labels fade to ink top to bottom, 90 ms apart.
5. **2.4 to 3.4 s.** A second square travels the top branch to "Your Vercel account", 1.0 s.
6. **3.4 to 3.8 s.** That panel's node fills with the accent `#ed4423`, and the word "running" fades in beside it in accent fill `#cf300c`, 0.3 s. It is the only accent in the frame.
7. **3.8 to 4.4 s.** The accent settles: the node turns ink and "running" becomes "live" in ink at weight 600. The caption "The same skills, on your own account" fades in at the bottom in second ink, 0.3 s.
8. **4.4 to 6.8 s.** Hold. Nothing moves for 2.4 s.
9. **6.8 to 7.2 s.** Everything fades back to the waiting grey together, 0.4 s.
10. **7.2 to 8.0 s.** Rest. The last frame matches the first.

Check before showing: no number, code, command or path on screen; no label touching a line or box edge; one accent element at a time; nothing overshoots; no dashes in any text.

## Open questions (ASK ME)

1. Where the sunk surface `#f1f1f1` and the raised surface `#ffffff` belong; neither shows in the frames.
2. Where accent fill `#cf300c` may fill a solid area; the frames use it only for accent words and thin outlines.
3. Whether the Hosted pieces also run in dark, and the dark values for second ink, muted and the two hairlines.
4. The grey for an inactive panel waiting its turn: frame 03 reads about `#888888`; muted `#555555` or strong hairline `#b1b1b1`?
5. Whether plain step numbers count as counts under rule 4.
6. The named easing curves for pans and fades.
7. The size, aspect and length of each Hosted page piece.

## Answers to the ASK ME items (the dispatcher, 2026-10-29 22:30 UTC, from the records; these replace each ASK ME above)

- **Sunk and raised surfaces.** As the site's tokens use them (`site/src/styles/tokens.css`, the website-build design system): the sunk surface `#f1f1f1` is a recessed area inside a frame (the sandbox's interior, a stage behind content); the raised surface `#ffffff` is an object that sits above the ground (a chat message card, the pull request window, a panel). Neither carries a shadow.
- **Accent fill `#cf300c`.** Only as the solid fill of one small object: a button-like control or the mark's end cell. Never a large area. The one accent element per frame is otherwise `#ed4423` as a stroke, a dot or text.
- **Dark.** Render every piece in the light palette only. The site shows its videos in the dark theme through one CSS rule, `filter: invert(0.93) hue-rotate(180deg)` on the video, its poster and any overlay together (website-build `references/motion.md` step 8), so no piece needs dark values.
- **An inactive panel or row waiting its turn.** Text in muted `#555555`, lines in strong hairline `#b1b1b1`. Hold no grey between them.
- **Step numbers.** None on screen. Stages, steps and routes are named (Plan, Execute, Review, Verify, Ship; Vercel, Railway, Your server), never numbered, so the no-counts rule never has to judge an ordinal.
- **Easing.** Entrances and moves: exponential ease-out `cubic-bezier(0.16, 1, 0.3, 1)`; a settle at the end of a move: the critically damped spring `1-(1+wt)e^(-wt)`; the return to the start state: ease-in-out `cubic-bezier(0.65, 0, 0.35, 1)` so nothing snaps home. No bounce, no overshoot (the design system's rule, `references/design-system.md` section 4, and the site's `RENDER.md` look).
- **Size, aspect and length of the Hosted pieces.** From `r2/shared/EFFECTS.md`: every effect 1200 x 750 (the site's loop size, shown at about 560 px); `routes-tabs` a 12-second loop, `request-to-pr` and `one-repo` 8-second loops; the chat demo on html-demo's fixed 1200 x 750 stage, 3 to 5 steps of 4 to 8 seconds.

## Scope of the plain-words rule (Dominik, 2026-10-30)

The never list's rule against code, names and numbers on screen applies to the motion videos. The chat run (html-demo) redraws the product's real chat screen and keeps its real text word for word, labelled "Example run".
