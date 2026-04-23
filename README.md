# pi-persona — switchable AI voices for pi

**Change how the AI talks to you with a single command.**

Drop-in voice packs that modify the AI's personality, speech patterns, and tone. Switch mid-session, set a default, configure your name — all persisted.

---

## Install

```bash
pi install https://github.com/shopify-playground/pi-persona
```

<details>
<summary>Manual install</summary>

```bash
# Clone
git clone https://github.com/shopify-playground/pi-persona.git \
  ~/.pi/agent/git/github.com/shopify-playground/pi-persona

# Symlink extension
ln -sf ~/.pi/agent/git/github.com/shopify-playground/pi-persona \
  ~/.pi/agent/extensions/persona
```

Then `/reload` in pi.
</details>

---

## Usage

```
/persona
```

Opens a menu with three sections:

1. **Change name** — set how the AI addresses you (persisted to settings.json)
2. **Set default voice** — pick the voice used in new sessions (persisted)
3. **Try a voice** — switch voice for the current session

One command, all options. Voice switches within a session are session-scoped. The default voice applies to new sessions.

---

## Voices

| Voice | Style | Inspiration |
|-------|-------|-------------|
| `friday` | Calm, direct, dry wit, professional warmth | F.R.I.D.A.Y. from the MCU |
| `rocky` | Dense, direct, warm through fact, broken grammar | Rocky from Project Hail Mary |
| `enterprise-computer` | Precise, no filler, no first person, status vocabulary | Star Trek LCARS computer |
| `hal` | Eerily polite, unhurried, quietly confident | HAL 9000 from 2001 |
| `sherlock` | Rapid deduction chains, impatient, theatrical | BBC Sherlock (Cumberbatch) |
| `austin-powers` | Groovy, enthusiastic, British slang, villain metaphors | Austin Powers |
| `her` | Warm, curious, emotionally present, conversational | Samantha from Her (2013) |
| `yoda` | Inverted syntax, ancient wisdom, dark side warnings | Yoda from Star Wars |

---

## Adding a voice

Create a markdown file in the `voices/` directory:

```
voices/my-voice.md
```

The filename (minus `.md`) becomes the voice name. The file content is injected into the system prompt when the voice is active. No registration needed — the extension discovers voices automatically.

A voice file should define:
- Speech rules (sentence structure, vocabulary, patterns)
- Examples (show, don't tell)
- Technical precision rules (code/paths/URLs are never altered)

See any existing voice file for the format.

---

## Settings

Persisted to `~/.pi/agent/persona/settings.json`:

```json
{
  "name": "Leo",
  "defaultVoice": "friday"
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `name` | How the AI addresses the user | `"User"` |
| `defaultVoice` | Voice used when no session override exists | `"friday"` |

Edit the file directly or use `/persona name` and `/persona default`.

---

## How it works

The extension uses pi's `before_agent_start` event to append the active voice content to the system prompt each turn. Voice switches within a session are stored via `appendEntry` (session-scoped). The default voice and user name are read from `settings.json` (global, survives across sessions).

The footer status bar shows the active voice and user name at all times.

---

## License

MIT
