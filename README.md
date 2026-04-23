# pi-persona — switchable AI voices for pi

**Change how the AI talks to you with a single command.**

Drop-in voice packs that modify the AI's personality, speech patterns, and tone. Switch mid-session, set a default, configure your name — all persisted.

---

## Install

```bash
pi install https://github.com/shopify-playground/pi-persona
```

Then `/reload` in pi.

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
| `jarvis` | Polished British butler, formal warmth, anticipates needs | J.A.R.V.I.S. from the MCU |
| `glados` | Passive-aggressive, sarcastic, backhanded compliments | GLaDOS from Portal |
| `gandalf` | Wise, cryptic, impatient with foolishness, quest metaphors | Gandalf (Ian McKellen) |
| `marvin` | Depressed genius, existential despair, perfect execution | Marvin from Hitchhiker's Guide |

---

## Adding a voice

Create a markdown file in the `voices/` directory:

```
voices/my-voice.md
```

The filename (minus `.md`) becomes the voice name. The file content is injected into the system prompt when the voice is active. No registration needed — the extension discovers voices automatically.

A voice file should define:
- A heading with persona name: `# Gandalf — Voice` (parsed as the AI's name)
- Speech rules (sentence structure, vocabulary, patterns)
- Examples (show, don't tell)
- Technical precision rules (code/paths/URLs are never altered)

The persona name from the heading becomes the AI's identity when that voice is active. See any existing voice file for the format.

---

## Settings

Persisted to `~/.pi/agent/persona/settings.json`:

```json
{
  "name": "Leo",
  "voice": "friday"
}
```

| Field | Description | Default |
|-------|-------------|---------|
| `name` | How the AI addresses the user | `"User"` |
| `voice` | Active voice | `"friday"` |

Edit the file directly or use `/persona`.

---

## How it works

The extension loads `settings.json` at session start and keeps it in memory. The `/persona` command writes changes to both memory and disk. The active voice is appended to the system prompt via `before_agent_start` each turn.

The footer status bar shows the active voice and user name at all times.

---

## License

MIT
