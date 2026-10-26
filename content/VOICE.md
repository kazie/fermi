# FerMEANie's voice

FerMEANie says her lines out loud and reads each question as it appears, on devices with sound on (it is on by default, from
the first tap; the speaker button in the header turns it off): every device online, only the big screen at a party (a big screen in the room), where phones
play only their own sound effects (see README "Sound"; the rule is `soundRoute` in `apps/client/src/lib/sound.ts`). Everything is free and runs locally: no paid text-to-speech service, no network at
play time. This file records what was chosen and why, how it works, and how to change it.

## The voice

The settings live in [`voice/voice.json`](voice/voice.json); every field is described below. They were picked by ear in
three audition rounds (October 2026), comparing engines, voices, blends, effects and pronunciations.

| Setting      | Value                                                    | Why                                                                        |
| ------------ | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `engine`     | `kokoro`: Kokoro-82M (Apache-2.0)                        | Best free quality that runs on a CPU; through `kokoro-onnx` in Python      |
| `model`      | `kokoro-v1.0.fp16.onnx` (v1.1 export), `voices-v1.0.bin` | Near-lossless (fp16); URLs and sha256 checked on every start               |
| `engineDeps` | kokoro-onnx, onnxruntime, espeakng-loader                | The packages whose versions shape the sound (part of every clip's key)     |
| `blend`      | 0.4 × `af_nicole` + 0.6 × `bf_emma`                      | A mix of two voice styles (style vectors added with these weights)         |
| `lang`       | `en-gb`                                                  | British pronunciation rules (espeak), preferred over American              |
| `speed`      | 1.0                                                      |                                                                            |
| `pronounce`  | FerMEANie → `fɚmˈiːni` (fer-MEAN-ie)                     | Kokoro says "fer-mee-NIGH" on its own; see below                           |
| `effects`    | "robot smooth": an ffmpeg filter chain                   | She is a bot, so robotic is charming, and it hides the joins between clips |
| `loudnessDb` | -19                                                      | Every clip at the same loudness (RMS), with peaks kept below clipping      |
| `opusKbps`   | 32                                                       | Opus is plenty for speech at this rate; MP3 is the fallback                |

**The effect chain**, in order: FFT robotisation (`afftfilt` keeps each frequency bin's magnitude and zeroes its
phase, window 1024 for a smooth buzz rather than a harsh one), a 6% higher pitch at the same speed (`asetrate` +
`atempo`), a tight echo (`aecho=0.8:0.4:18:0.3`), and a band-pass (150 Hz – 8.5 kHz).

**Pronunciations.** For a word Kokoro gets wrong, the worker replaces it with a stand-in word it knows
(`placeholder`, here "Hermione"), turns the sentence into phonemes, then swaps the stand-in's phonemes for `ipa`.

**Turned down in the auditions:**

- Paid services (ElevenLabs, OpenAI, Cartesia, Hume…): good voices, but the decision was to stay free and local.
- int8 model files: rougher than fp16 (the v1.1 int8 export also rendered slowest); see Model precision below.
- Piper: fast, but it didn't sound good.
- Male voices: FerMEANie is female, like GLaDOS.
- Other blends (nicole/emma 80/20, 60/40, 50/50; three-voice mixes with heart or sky), American rules, speeds 0.9
  and 1.1, and the other effect presets (clean, light, the GLaDOS-ish ones with the dry voice mixed in, a coarser
  robot): all close, but not the favourite.
- Pronunciations fer-MY-uh-nee (like Hermione), a softer fer-MEE-nee, and FER-mee-nee.
- Splicing names into the middle of pre-rendered sentences: lines are cut at sentence boundaries instead (below).

## How it works

```
line (with markup) → speech text → sentences → clip key per sentence → worker → /voice/<key>.webm|.mp3 → client queue
```

- **Speech text** (`apps/server/src/voice/speech.ts`): markup stripped (`||redacted||` is said as "redacted"), and the
  game's number formats spelled out for the speech engine: `2.4×` → "2 point 4 times", `3 200` → "3200",
  `3.2 × 10²⁰` → "3 point 2 times 10 to the 20", `v3.14` → "version 3 point 1 4".
- **One clip per sentence.** Most of her sentences have no variables ("Please accept this dunce cap."), so they're
  rendered once and kept forever; only the short sentences with a name or a number are rendered during a game. Lines
  play as their clips back to back, with 150 ms between sentences.
- **Clip keys** are a hash of the voice's fingerprint and the sentence. The fingerprint is `voice.json` (her
  settings, and the model files' checksums) plus the versions `uv.lock` pins for its `engineDeps`. A clip rendered
  anywhere is valid everywhere, folders can be merged, and changing anything that shapes her sound gives every
  sentence a new key (old clips are simply unused), so old and new audio never mix in a line. Other packages and
  ffmpeg's version are left out: they don't change the voice (ffmpeg's effects could, slightly; it comes with the
  Debian base image and changes rarely).
- **The worker** (`apps/server/voice/worker.py`, run in the locked environment below) loads Kokoro once and renders sentences on request:
  speech, effects, loudness, then Opus and MP3, written atomically. The server starts it on the first job and
  restarts it if it dies (`apps/server/src/voice/worker.ts`). After ten failures in a row (no uv, no ffmpeg, no
  model) rendering rests for five minutes and then goes on with the queue as it is; `pnpm q voice` shows why
  (`broken`), and `pnpm voice:render` stops with the reason.
- **The queue** (`apps/server/src/voice/index.ts`) renders in order of need:
  - _live_: lines being said now, earliest first. One still unrendered 10 s after it was due is dropped, so a backlog
    clears itself.
  - _ahead_: lines picked early, and questions added while the server runs.
  - _lobby_: her lobby chatter, below anything a game needs. Like _live_, a line still unrendered 10 s after it was
    due is dropped, so a burst of joins can't leave a backlog.
  - _sweep_: everything that can be rendered before a game, then players' names, in the order asked for; at most
    20,000 waiting, so name renders from many rooms can't pile up.
- **The clip folder** is checked on demand, so clips copied in while the server runs are found, and a clip deleted
  from it is rendered again when it's next needed.
- **Rendering ahead** (`apps/server/src/voice/sweep.ts` and `apps/server/src/game.ts`):
  - At startup: every active question first (one is read out the moment its round starts, while her lines get a
    typing beat), then every sentence without variables (about 1,150) and those that only count players (0–30).
    Questions added later go into the _ahead_ tier, so they don't wait behind the sweep.
  - As players join: every sentence that only names them (about 250 each; speculative, so at the lowest priority, and
    at most 60 names per room, however often someone renames). Names and counts go into a line before it's split,
    as in the game: a name can move a sentence end ("Nice try. kazie wins." is one sentence).
  - During each reveal: the next question's line is picked (with the scores the reveal gives), and during the last
    reveal the final lines, so they render while players watch. If the situation changes (a different category of
    line), a fresh line is picked.
  - Each question is read before her line, which gives a just-picked line a few more seconds.
  - In the lobby (`lobby.*`): her line as the room opens, as someone joins, as someone leaves (kicked or gone), when
    the room empties, and after a game. They go in the _lobby_ tier, so a game starting right after a burst of joins
    has its question rendered first. Join lines open with a sentence without the name, which gives the name's clip
    time to render. A rename edits her greeting to the new name without saying it again, and a name past the room's
    cap on rendering names is greeted in text only. Clients say a lobby line only when she isn't already talking.
  - The name screen: her greeting (`greeting`, always to "HUMAN_NAME_HERE", said as "human name here") and the
    quote under the field (`welcome`), both picked by the server for whoever is on that screen. They're fixed lines,
    rendered at startup, and the bubble never shows the name being typed, so typing can't make the server render
    anything. The page says both once, as soon as sound can play (usually the tap into the name field).
- **Snapshots** carry `voice`: for each line and question in the view, its clip keys, and which of them
  aren't rendered yet (nearly always none).
  Its presence tells the client that her lines are paced to her voice. The speaker button shows either way: sound
  effects play without a voice too.
- **Ready clips are pushed.** When the worker finishes a clip, each room whose view uses it sends `{ type: 'voice',
ready: [...] }` over the websocket (clips finishing within 100 ms go in one message). Clients never ask for a clip
  that isn't there, so a game produces no 404s: some setups treat bursts of them as an attack (fail2ban) or a sick
  service, and a clip arrives the moment it exists instead of at the next poll.
- **The client** (`apps/client/src/composables/useVoice.ts`), with sound on (the default, unless the player turned it off):
  - Fetches each clip as soon as it's both listed and ready; a line waiting for a clip that isn't ready gets it the
    moment the server says so. Clips are kept encoded and decoded as they play.
  - Plays each line when its message starts typing (`FermeanieSays`), one line at a time. A line more than 1.5 s late
    (a remount, a reconnect) is skipped; so is one whose first clip takes more than 1.5 s to arrive (4 s for a
    question, which stays on screen). A dunce remark is skipped if she's already talking; a missing sentence ends its
    line; a line already said (a bubble that remounted: the same start time and place) isn't said again; a hidden tab stops talking.
  - Uses Web Audio. Opus first, MP3 for browsers that can't decode it. On iOS, where she speaks, it asks to play through the
    silent switch (`navigator.audioSession` 'playback'); a phone at a party, which only clicks for its own moments,
    uses 'ambient', so it mixes with the player's music and respects the switch. Browsers need a tap before any sound,
    so sound waits for the first tap (or click, or key); the big screen shows a nudge until it gets one.
- **Pacing** (`packages/shared/src/chat.ts`): on a server with a voice, each message stays up until she has finished
  saying it (`speechDuration`: about 400 ms a sentence plus 58 ms a character as she reads it, numbers spelled out,
  measured on her clips and rounded up), and the reveal lasts until the last one is said. This is the same on every
  device, sound on or off, so they all stay in step. Only lines she says are paced and voiced: those the server sent
  clips for, in a bubble on the server clock. Recaps (their own clock) keep the plain reading pauses.

Measured speed: a full render (about 1,850 clips) took 20 minutes on a 24-core workstation, about 0.65 s per
sentence. One worker renders one sentence at a time, so more cores barely help. A small server (a 2-core laptop CPU,
no GPU) took about twice as long per sentence in the same test, so expect about 40 minutes there.

## Running it

```bash
FERMI_VOICE=1 pnpm dev          # needs uv and ffmpeg; uv installs the locked packages, the model (~90 MB) downloads
pnpm q voice                    # what's rendered and queued (counts only)
pnpm q voice --sweep            # render whatever is missing
pnpm voice:render [--out DIR]   # the same sweep without a server, e.g. on another machine, then rsync DIR
```

| Variable             | Default                       | What it does                                         |
| -------------------- | ----------------------------- | ---------------------------------------------------- |
| `FERMI_VOICE`        | off                           | `1` turns her voice on                               |
| `FERMI_VOICE_DIR`    | `voice/` next to the database | Where clips are kept (`/data/voice` in Docker)       |
| `FERMI_VOICE_MODELS` | `.fermi-work/voice-models`    | Where the Kokoro model is downloaded                 |
| `FERMI_VOICE_SWEEP`  | on                            | `0`: render only what is said, nothing ahead (tests) |

The Docker image includes ffmpeg, uv, the worker's Python packages and the model, so the voice works offline. Mount
the clip folder (e.g. `-v ~/fermi-data/voice:/data/voice`) to keep it across deployments and reach it with rsync.

Tests use a fake renderer. `FERMI_VOICE_TEST=1 pnpm test` also runs the real worker once, and
`FERMI_VOICE=1 pnpm test:e2e` adds a browser test that checks sound is on after the first tap and that her clips play.

## Dependencies

The worker is a small Python project, `apps/server/voice/`:

- **`pyproject.toml`** lists what it needs, with lower bounds.
- **`uv.lock`** pins every package exactly. It's what the server runs (`uv run --project apps/server/voice --frozen`)
  and what the Docker image installs (`uv sync --frozen`), so every build is the same. CI checks that the lock matches
  the pyproject (`uv lock --check`).
- **`.python-version`** pins the interpreter (3.12).
- The uv binary comes from the image's `ghcr.io/astral-sh/uv` stage; Dependabot's Docker updates keep it current.

To update by hand: `uv lock --upgrade-package <name> --project apps/server/voice` (or `--upgrade` for all), then
`uv sync --project apps/server/voice` for the local environment. The server warns if the local environment doesn't
match the lock.

**Dependabot** opens a monthly PR for the Python packages (label `voice`). The packages that shape her sound (the
`voice-engine` group: kokoro-onnx, onnxruntime, espeakng-loader) come in a PR of their own. Before
merging one:

1. Listen. Play a game with sound on, or render the audition script: `pnpm test:e2e:video` doesn't help, because its
   videos are silent.
2. Merging changes the fingerprint, so every clip gets a new key. The server's sweep renders everything again (about
   20 minutes on a fast machine, about 40 on a small server). Or render ahead with `pnpm voice:render` on another machine (so the server stays free) and rsync the folder.

**Model precision** (October 2026, kokoro-onnx 0.6.1, `model-files-v1.1`): the same lines were rendered with the
int8, fp16 and full (fp32) exports of the same model, and with the earlier int8 file. fp16 sounded best; the v1.1
int8 sounded rough and was the slowest (about 2.3× fp16's render time on the small server). fp16 renders as fast as
the earlier int8 did, on a workstation and on a small server, and is half the size of fp32 with near-identical
output (the release measures 0.999 spectral correlation against fp32, 0.916 for int8).

## Changing to another model

The worker's engine is a class (`Kokoro` in `worker.py`, picked by `voice.json`'s `engine` through `ENGINES`). For a
better model:

1. Add its package to `pyproject.toml` and run `uv lock`.
2. Add an engine class next to `Kokoro`. It needs one method, `speak(text)`, which returns 24 kHz float samples. The
   effects, loudness and encoding stay as they are.
3. Point `voice.json` at it: `engine`, the model files' URLs and sha256 (`sha256sum`), and its `engineDeps`.
4. Audition it (below).
5. Merge. Every clip re-keys and is rendered again with the new voice.

## Changing the voice

Edit `voice/voice.json` and restart the server: every sentence gets a new key, and the sweep renders them all again
(or run `pnpm voice:render` on another machine and rsync the folder). To audition before deciding:

1. Render the same short script (about five lines, a fake question and the name, with names and numbers filled in) in
   each candidate: voice or blend × effect chain × pronunciation, using the worker's code for speech and effects.
2. Join each candidate's clips into one reel with gaps, encode it as Opus and MP3, and write an HTML page with a grid of
   players (candidates as rows, effects as columns) and a button that test-decodes Opus with Web Audio.
3. Serve the folder on the LAN (`python3 -m http.server`) and listen on a phone and a computer.

The scripts used for the October 2026 auditions are kept outside the repository (in `.fermi-work/voice/` on the
owner's machines).

Kokoro's voices: 54 presets, of which 15 English female (`af_alloy`, `af_aoede`, `af_bella`, `af_heart`,
`af_jessica`, `af_kore`, `af_nicole`, `af_nova`, `af_river`, `af_sarah`, `af_sky`, `bf_alice`, `bf_emma`,
`bf_isabella`, `bf_lily`); previews at https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md. Blends of
any of them are new voices.

## Not done yet

- Hand-written spoken versions of lines (a Fluent attribute such as `.tts`) where the written line reads badly aloud.
  `loadFluent` rejects attributes today.
- Pruning clips no setting uses any more.
- The home page's line isn't voiced (no room yet, and no tap, so the browser wouldn't play it anyway). Recaps stay
  silent on purpose: they're for reading back through a finished game.
- Several devices with sound on in one room aren't synchronised, so a little echo is possible.
- More workers, or rendering on a GPU, if `pnpm q voice` shows clips expiring.
- The e2e videos (`pnpm test:e2e:video`) are silent: Playwright's video recording captures only the screen and has no
  audio option (a long-standing request upstream). To hear her in a test run: record in the page (wrap the
  AudioContext so her output also goes to a `MediaStreamAudioDestinationNode` + `MediaRecorder`, save the recording
  next to the video) and merge the two with ffmpeg, expecting sync within a fraction of a second; or run headed and
  screen-record with OS audio. Check first whether a newer Playwright records audio itself.
