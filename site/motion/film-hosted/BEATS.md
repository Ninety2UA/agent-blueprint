# Hosted launch film: beat sheet for approval

Draft for Dominik's approval, 2026-11-03. Writing only: nothing is composed, rendered or scored yet.

- **What launches:** Agent Blueprint, hosted. The same skills run as an agent on your own Vercel account, Railway or server.
- **Frame:** 1920 x 1080, 30 fps, light palette only (the site shows it dark through its invert filter). Look and motion follow `r2/MOTION.md` and `r2/brand.md`.
- **Length:** 43.0 s, 7 beats, 5 chapters.
- **Plays:** muted autoplay with a sound control and chapters (plan U14). Every beat reads with the sound off.
- **What it adds to the page:** Fig. 1 already runs one request to its pull request, Fig. 2 the prerequisites, Fig. 3 the three hosts and Fig. 4 the demo's web chat. The film adds the five ways to ask, the sandbox, finished stages staying on the branch, and a pull request that reaches only the repository your App is installed on.

## The sentence

One sentence, split across four beats:

> Ask for a change where you already work, / and the agent works on it in a sandbox, / pushes each stage as it finishes / and opens the pull request as your GitHub App.

It restates the Hosted page's own line in `site/src/components/hosted/Hero.astro`: "You ask through the web chat, Slack, Linear, Telegram or MCP, and the agent works in a sandbox. It pushes a branch as each stage finishes and opens a pull request as your GitHub App."

## Beats

| # | Time | Chapter | Beat |
|---|---|---|---|
| 1 | 0.0 to 4.0 s | Ask | The name and the first words of the sentence, on a clean sheet |
| 2 | 4.0 to 9.0 s | Ask | The five ways to ask |
| 3 | 9.0 to 18.0 s | Ask | The web chat, with a request typed into the real field and sent |
| 4 | 18.0 to 24.0 s | Sandbox | The request goes into the sandbox |
| 5 | 24.0 to 32.0 s | Stages | The stages finish in turn, each pushed to the branch |
| 6 | 32.0 to 37.0 s | Pull request | The pull request opens as your GitHub App |
| 7 | 37.0 to 43.0 s | Deploy | Name, call to action, how the demo opens |

Chapters for the player's chapters file: Ask 0, Sandbox 18.0, Stages 24.0, Pull request 32.0, Deploy 37.0.

### Beat 1. Hook (0.0 to 4.0 s, chapter Ask)

- **On screen:** "Agent Blueprint, hosted." as a heading, top left, ink. Below it, in display: "Ask for a change where you already work,"
- **Shown:** a drawing sheet on the paper ground, built in the site's order. The sheet outline and corner registration crosshairs are in by 0.25 s, the title-block cells and baseline by 0.5 s. The heading fades grey to ink from 0.75 to 1.0 s and the fragment from 1.25 to 1.6 s. No accent yet. Pattern: the existing film's cover sheet (`site/motion/film/composition.html`, "Cover sheet").
- **Camera:** still. Nothing moves after 1.6 s, so a stranger has read both lines by second 4.
- **Music:** a low sustained pad fades in over the first second, with no percussion. One soft pluck where the fragment lands at 1.25 s.

### Beat 2. Where you ask (4.0 to 9.0 s, chapter Ask)

- **On screen:** fragment 1 stays. To its right, five quiet labels build top to bottom, 90 ms apart, grey to ink:
  - "Open the web chat"
  - "Mention the agent in Slack"
  - "Assign it a Linear issue"
  - "Message its Telegram bot"
  - "Call it over MCP"
- **Shown:** a hairline from the fragment splits into five branches, one per label, each drawing along its length in 0.4 s. At 7.2 s the marker dot of "Open the web chat" fills with the accent, the one accent in the frame. The words are the `ask` strings in `site/src/components/hosted/Steps.astro` (CHANNELS), capitalised the way that file's `askLine` does. The five channels exist in `eve/agent/channels/` (`slack.ts`, `linear.ts`, `telegram.ts`, `mcp.ts`, and `eve.ts` with `eve/apps/web` for the chat).
- **Camera:** a slow push-in of the whole plane, 100 to 104 percent, from 4.0 to 9.0 s. No parallax.
- **Music:** a muted pulse joins the pad at 4.0 s. One soft tick when the accent dot fills.

### Beat 3. The product working (9.0 to 18.0 s, chapter Ask)

- **On screen:** a small label "Example run" top left. The real chat's words: the heading "New session", the field label "Your request" and the button "Send". The request types live into the field, word for word:
  "Add input validation to the main function so an empty argument gives a clear error message, with a test."
- **Shown:** the web chat of a deployer's copy, redrawn flat from its source:
  - the session heading (`eve/apps/web/components/chat/title-block.tsx`);
  - the composer with its label and button (`eve/apps/web/app/_components/home-chat-page.tsx`, which labels the field "Your request" when no suggested requests show; `eve/apps/web/components/chat/composer.tsx`, `submitLabel = "Send"`);
  - on the right, the run panel's empty cells "Sheet", "Branch" and "Stages", with the five stage rows in waiting grey (`eve/apps/web/components/chat/run-panel.tsx`). The branch cell shows its label only, because its placeholder is code.

  No sidebar, no browser frame, no window chrome. The request is the demo's second suggested request (`eve/apps/web/components/chat/gate-notice.tsx`); Fig. 1 already uses the third.
  - 9.0 to 10.35 s: the camera pans right to the chat sheet.
  - 10.8 to 16.0 s: the request types into the field at an even pace. Nothing else in the film types.
  - 16.3 s: "Send" fills with the accent fill as it is pressed, then settles back.
  - 16.8 to 17.6 s: the request fades into the conversation column above the field.
- **Camera:** the pan, then a slow push-in toward the field from 10.35 to 16.0 s (100 to 108 percent), easing out before "Send".
- **Music:** the pulse holds under the typing, with no keyboard sounds. One clean hit on "Send" at 16.3 s.

### Beat 4. The sandbox (18.0 to 24.0 s, chapter Sandbox)

- **On screen:** fragment 2 in display, top left: "and the agent works on it in a sandbox,". Quiet labels "Shell", "Files" and "Git" inside the sandbox, "Running" beside it while it is live, and "Your repository" on an outline to the right in waiting grey.
- **Shown:** a drawn sheet. A small solid ink square, the request, travels from the left edge into a rectangle in the sunk surface tone labelled "Sandbox" (1.0 s, slow start, soft landing). The three labels fade in inside it, top to bottom, 90 ms apart. The sandbox's node fills with the accent and "Running" fades in beside it in accent fill. A hairline draws from the sandbox to the "Your repository" outline and stays grey until beat 6. "Running" is the chat's own word for a live run (`eve/apps/web/components/chat/sidebar.tsx`; seen in `~/ab-shots/busy-open-chat/after-new-session-listed-light-1280.png`).
- **Camera:** a horizontal pan right to this sheet, 18.0 to 19.35 s, then still.
- **Music:** a bass note enters as the square lands in the sandbox, at about 19.5 s.

### Beat 5. Each stage pushed (24.0 to 32.0 s, chapter Stages)

- **On screen:** fragment 3 in display, top left: "pushes each stage as it finishes". The panel's labels "Branch" and "Stages", and the stage names "Plan", "Execute", "Review", "Verify" and "Ship". At 31.0 s a caption fades in at the bottom in second ink: "A sandbox that stops at its limit loses no finished stage."
- **Shown:** the run panel's "Branch" and "Stages" cells, redrawn large from `eve/apps/web/components/chat/run-panel.tsx`. From 25.0 s each row runs in turn, about 1.2 s apiece: its dot and name take the accent (the panel's "now" state), then settle to ink as the stage finishes. As each row settles, a small ink square travels a hairline from the row up to the "Branch" cell. This is the quality beat, with one accent at a time. The real panel keeps a finished Ship row in the accent; here it settles to ink, so the pull request in beat 6 holds the only accent.
- **Camera:** a pan right to the panel, 24.0 to 25.35 s, then a slow drift down the rows as they run, 25.35 to 31.0 s. It never passes its target.
- **Music:** one light note as each row finishes, rising row by row.

### Beat 6. The pull request (32.0 to 37.0 s, chapter Pull request)

- **On screen:** fragment 4 in display, top left: "and opens the pull request as your GitHub App." The cell label "Pull request", a button "Pull request" and a button "Open the branch". Then a caption in second ink: "It asks you first, and it reaches only the repository your App is installed on."
- **Shown:** the run panel's "Pull request" cell (`eve/apps/web/components/chat/run-panel.tsx`). At 33.0 s the "Pull request" button fills with the accent fill, the one accent in the frame; "Open the branch" sits beside it as an outline button. The real button reads "Pull request #" and a number. The number is left off under the no-numbers rule (`r2/MOTION.md`, Never 4). A hairline runs from the button to the "Your repository" outline from beat 4, which turns from grey to ink. The caption fades in at 34.0 s.
- **Camera:** a push-in on the cell, 32.0 to 33.0 s, then a short pull back, 34.0 to 35.0 s, to bring the repository outline into frame.
- **Music:** the chord resolves on the button at 33.0 s.

### Beat 7. End card (37.0 to 43.0 s, chapter Deploy)

- **On screen:** "Agent Blueprint, hosted." The line "On your own Vercel account, Railway or server." Two buttons, "Deploy" and "Try the demo". Under "Try the demo", in second ink: "This demo opens with a code, and the code comes in Dominik's message to you."
- **Shown:**
  - 37.0 to 38.5 s: the camera pulls back once to the overview of every sheet, as the existing film ends.
  - The mark builds cell by cell from `site/public/brand/mark.svg`: ink cells first, then the skipped cells as outlines, then the last cell in the accent. The mark holds the frame's only accent, so both buttons are drawn as ink outlines.
  - 38.5 to 39.5 s: the title, the line and the buttons fade in.
  - 39.5 to 43.0 s: everything holds still for 3.5 s.

  The title, the line and both button labels come from `site/src/components/hosted/Hero.astro`; the line shortens the lede's "on your own Vercel account, Railway or server". The demo sentence is the demo gate's own wording.
- **Camera:** the pull-back, then still.
- **Music:** the pad holds. A soft final hit lands with the mark's last cell, then the music fades out over the last 1.5 s and ends at 43.0 s.

## Where this departs from the launch-video skill

- No counted metric. Plan U14 removes the number beat from the skill's default layout, and the stages beat carries the proof.
- No glass panels. `r2/brand.md` and `r2/MOTION.md` rule out glass, glow, blur and gradients, so the product screens are redrawn flat in the Drafting Table style.
- Typing happens only in the chat's real "Your request" field, as the skill asks.

## Facts used

Line numbers are lines of `/Users/mini/.cache/ab-hosted-design/FACTS.md`.

- The same skills, on the deployer's own Vercel account, Railway or a server: line 9; on screen in the words of `Hero.astro`'s lede.
- The agent's shell, files and git run in a sandbox: line 9.
- The pull request is pushed as a GitHub App created for that one repository, which can reach no other: lines 9 and 63.
- The agent asks at checkpoints and before it opens a pull request when a person asks in a chat: lines 55 and 124.
- The branch is pushed as each stage finishes: line 124. The chat's own wording in `title-block.tsx` is "each stage is pushed to a branch as it finishes".
- "A sandbox that stops at its limit loses no finished stage": line 118, quoted from eve/README.md.
- The typed request, word for word: line 134 (`gate-notice.tsx`).
- The demo's gate sentence, word for word: line 140.
- Linear, Telegram and MCP may be named once they land: line 212. They have landed in `eve/agent/channels/linear.ts`, `telegram.ts` and `mcp.ts` at 2ed53743, and the Hosted page names them in `Hero.astro` and `Steps.astro`.
- The mark, its accent end cell and its files: line 146. The palette and fonts: lines 144 to 147.
- The film at or under 6 MB, muted autoplay, a visible sound control: line 171.
- The stage names Plan, Execute, Review, Verify and Ship: the run panel in `~/ab-shots/busy-open-chat/after-new-session-listed-light-1280.png` and the `loop-request-to-pr` entry in `site/src/components/kit/kit-data.ts`.
- Never-claim check against lines 191 to 203: no count, price, speed, user number, "secure", "private", "one click", release claim, "tally" or "any repository" appears on screen.

## Open questions for Dominik

1. **Whose chat in beat 3.** As written, the film shows a deployer's copy ("Your request", no Repository cell, "Pull request"). The alternative is the demo's own copy, with its "Repository" cell and "Pull requests open as agent-blueprint-demo[bot]". That matches Fig. 4 more closely, but it puts a repository path and a bot name on screen, which the motion rules count as code.
2. **All five channels in beat 2, or only Web chat and Slack.** FACTS.md was verified on 2026-10-29, before Linear, Telegram and MCP landed; the repository and the Hosted page name all five now. Keep five, or hold the film to the two that FACTS.md verified until it is re-verified?
3. **The demo's address on the end card.** As written, the end card says "Try the demo" with no address, since the film plays on the page beside the real link. Adding try.agent-blueprint.dbenger.com would help anyone who sees the film away from the page.
