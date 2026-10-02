# Tifo Studio

A local web app for making **Tifo Football-style animated tactics videos**. It runs on your
own computer, works offline, and exports finished MP4s up to 4K.

- **3D tactics board**: a textured pitch in the Tifo style. The camera can zoom, tilt (a
  broadcast angle) and rotate, and glides between keyframes. Players are 3D pucks and the
  goals have 3D nets.
- **Animation**: drag players and the ball at different moments and the movement is eased
  between keyframes. Formations (4-3-3, 4-4-2, 4-2-3-1, 3-5-2, 3-4-3, 5-3-2) go in with one
  click. Continue ▸ starts a new scene where the last one ended.
- **Tactical graphics**:
  - pass, run and dribble arrows that draw themselves on
  - distance lines in metres
  - zones
  - cover shadows (the cone behind a presser that the ball can't reach)
  - spotlights that can follow a player
  - lines linking players and filled team shapes
  - movement trails, highlight rings and name tags
  - player portraits on the discs
- **Cards and charts**: title, chapter, quote and lower-third cards, with illustrations,
  parallax and Ken Burns motion. Animated bar charts for stats. Transitions: wipe,
  crossfade and fade.
- **Illustrate filter**: turns a photo into a flat, outlined poster or a team-colour
  duotone, to get close to Tifo's hand-drawn look.
- **Local AI voiceover**: free Piper neural voices (British narrators), your Mac's
  built-in voices, or Windows voices. Generate narration per scene, or for the whole script
  in one go, and each scene's length fits the audio. You can also record your mic or upload
  audio.
- **Sound**: background music with a fade-out, plus automatic sound effects (whooshes on
  transitions and camera moves, ticks when graphics appear). A limiter stops clipping.
- **Pro export**: frame-accurate H.264 MP4 at 720p, 1080p, 1440p or 4K, at 30 or 60 fps.
  Long or 4K videos can stream straight to disk. Also PNG snapshots for thumbnails and
  `.srt` subtitles.

## Install (one command)

The installers need no admin rights. They download a portable Node.js if needed, the Piper
voice engine and two British voices, create a Desktop/Start-menu shortcut, and open the app
in your browser. Run them again at any time to update; your projects are kept.

**Windows**: open PowerShell and paste:

```powershell
irm https://raw.githubusercontent.com/Anwars3/gemini-cli/claude/focused-meitner-oqnrj2/tifo-studio/install/install.ps1 | iex
```

**macOS / Linux**: open Terminal and paste:

```bash
curl -fsSL https://raw.githubusercontent.com/Anwars3/gemini-cli/claude/focused-meitner-oqnrj2/tifo-studio/install/install.sh | bash
```

After the pull request is merged you can use `main` instead of
`claude/focused-meitner-oqnrj2` in those links.

Already downloaded the repo? Double-click `Install-Windows.cmd` (Windows) or
`Install-Mac.command` (macOS), or run `bash install/install.sh`.

It installs to `%LOCALAPPDATA%\TifoStudio` (Windows) or `~/TifoStudio` (macOS/Linux).
To start it later, use the **Tifo Studio** shortcut. Use **Chrome or Edge** for 4K and
60 fps export.

### Manual start (if you already have Node.js 18+)

```bash
cd tifo-studio
npm start          # then open http://localhost:5173
```

The AI voice needs Piper in `tifo-studio/tts/`, which the installer sets up. Without it,
the app uses your system's voices (macOS `say`, Windows voices, or eSpeak on Linux).

## Making a video

1. **Script → Scenes**: paste your script. Each paragraph becomes a scene, voiced
   automatically.
2. **Insert XI** for both teams. Move the playhead, then drag players or the ball to animate
   them. **◆ Key** (K) holds a position until that moment.
3. Add graphics timed to the words. Each object has **Appears** and **Disappears** times.
4. Set the camera for each moment: **Zoom**, **Tilt (3D)**, **Rotate**, or a preset
   (Top-down, Broadcast, Dramatic, From goal). The 🎥 tool drags a zoom frame.
5. Break the tactics up with **cards** (title, chapter, quote, illustration) and **charts**.
6. **Export Video**: 1080p/60 for YouTube, or 4K. **📷 Snapshot** makes the thumbnail.

### Shortcuts

| Key | Action |
| --- | --- |
| Space / Shift+Space | Play scene / play all |
| ← → (Shift) | Step 1 frame (1 s) |
| K | Keyframe the selection at the playhead |
| Ctrl+C / Ctrl+V / Ctrl+D | Copy / paste (also between scenes) / duplicate |
| Ctrl+A | Select everything in the scene |
| Delete | Delete the selection |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| V H A B | Select, Home player, Away player, Ball |
| P R D L M | Pass, Run, Dribble, Line, Measure |
| Z E S O T C | Zone, Ellipse, Shadow, Spotlight, Text, Camera |

## Files

```
server.js              local server: static files, project storage, text-to-speech
install/               one-command installers (install.ps1, install.sh)
public/index.html      editor UI
public/guide.html      how Tifo-style videos are made
public/js/model.js     data model, keyframes, formations, sample project
public/js/renderer.js  perspective camera + canvas renderer (the Tifo look)
public/js/audio.js     voiceover, music, sound effects, mic recording, offline mix
public/js/exporter.js  WebCodecs MP4 export, real-time fallback, PNG, SRT
public/js/image.js     photo → illustration filters
public/js/app.js       editor interactions
public/vendor/         mp4-muxer (MIT)
public/fonts/          Oswald (SIL Open Font License)
tts/                   Piper engine + voices (created by the installer, not in git)
projects/              your saved projects (not in git)
```

Voices come from [Piper](https://github.com/rhasspy/piper) (MIT). Each voice has its own
license, listed on its [model card](https://huggingface.co/rhasspy/piper-voices).
