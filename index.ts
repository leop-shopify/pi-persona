/**
 * Persona Extension
 *
 * Switch how the AI talks via /persona command.
 * Voices are markdown files in the voices/ directory.
 * Settings live in ~/.pi/agent/persona/settings.json.
 *
 * Each voice file declares a persona name in its heading:
 *   # Friday — Voice         → persona name "Friday"
 *   # Austin Powers — Voice  → persona name "Austin Powers"
 *
 * Usage:
 *   /persona — opens a menu to switch voice, change name, or set default
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const VOICES_DIR = path.join(path.dirname(import.meta.url.replace("file://", "")), "voices");
const SETTINGS_DIR = path.join(os.homedir(), ".pi", "agent", "persona");
const SETTINGS_PATH = path.join(SETTINGS_DIR, "settings.json");
const ENTRY_TYPE = "persona-voice";

interface Settings {
	name: string;
	defaultVoice: string;
}

interface Voice {
	content: string;
	personaName: string;
}

interface VoiceEntry {
	voice: string;
}

function loadSettings(): Settings {
	try {
		const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
		const parsed = JSON.parse(raw);
		return {
			name: parsed.name ?? "User",
			defaultVoice: parsed.defaultVoice ?? "friday",
		};
	} catch {
		return { name: "User", defaultVoice: "friday" };
	}
}

function saveSettings(settings: Settings) {
	fs.mkdirSync(SETTINGS_DIR, { recursive: true });
	fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

function parsePersonaName(content: string, fallback: string): string {
	// Parse from heading: "# Austin Powers — Voice" → "Austin Powers"
	const match = content.match(/^#\s+(.+?)\s+[—–-]\s+Voice/m);
	if (match) return match[1].trim();
	return fallback.charAt(0).toUpperCase() + fallback.slice(1);
}

function discoverVoices(): Map<string, Voice> {
	const voices = new Map<string, Voice>();
	if (!fs.existsSync(VOICES_DIR)) return voices;

	for (const file of fs.readdirSync(VOICES_DIR)) {
		if (!file.endsWith(".md")) continue;
		const id = file.replace(/\.md$/, "");
		const content = fs.readFileSync(path.join(VOICES_DIR, file), "utf-8");
		const personaName = parsePersonaName(content, id);
		voices.set(id, { content, personaName });
	}
	return voices;
}

function updateStatus(ctx: { ui: { setStatus(id: string, text: string): void } }, voice: Voice | undefined, voiceId: string, userName: string) {
	const label = voice ? voice.personaName : voiceId;
	ctx.ui.setStatus("persona", `${label} | ${userName}`);
}

export default function persona(pi: ExtensionAPI) {
	let settings = loadSettings();
	let activeVoice = settings.defaultVoice;
	let voices = discoverVoices();

	// Restore voice override from session entries on start/reload
	pi.on("session_start", async (_event, ctx) => {
		settings = loadSettings();
		voices = discoverVoices();
		activeVoice = settings.defaultVoice;

		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === ENTRY_TYPE) {
				const data = entry.data as VoiceEntry | undefined;
				if (data?.voice && voices.has(data.voice)) {
					activeVoice = data.voice;
				}
			}
		}

		updateStatus(ctx, voices.get(activeVoice), activeVoice, settings.name);
	});

	// Register /persona command — single entry point
	pi.registerCommand("persona", {
		description: "Switch AI voice/persona",
		handler: async (_args, ctx) => {
			const voiceIds = [...voices.keys()];

			// Build menu: settings first, then voices with persona names
			const options: string[] = [
				`Change name (current: ${settings.name})`,
				`Set default voice (current: ${settings.defaultVoice})`,
				"---",
				...voiceIds.map((id) => {
					const voice = voices.get(id)!;
					const label = `${voice.personaName} (${id})`;
					return id === activeVoice ? `${label} [active]` : label;
				}),
			];

			const choice = await ctx.ui.select("Persona", options);
			if (!choice) return;

			// Change name
			if (choice.startsWith("Change name")) {
				const newName = await ctx.ui.input("Name:", settings.name);
				if (!newName) return;

				settings.name = newName;
				saveSettings(settings);
				updateStatus(ctx, voices.get(activeVoice), activeVoice, settings.name);
				ctx.ui.notify(`Name set to ${settings.name}`, "info");
				return;
			}

			// Set default voice
			if (choice.startsWith("Set default voice")) {
				const defaultOptions = voiceIds.map((id) => {
					const voice = voices.get(id)!;
					const label = `${voice.personaName} (${id})`;
					return id === settings.defaultVoice ? `${label} [current]` : label;
				});

				const picked = await ctx.ui.select("Default voice:", defaultOptions);
				if (!picked) return;

				// Extract voice id from "PersonaName (voice-id) [current]"
				const idMatch = picked.match(/\(([^)]+)\)/);
				if (!idMatch) return;
				const voiceId = idMatch[1];
				if (!voices.has(voiceId)) return;

				settings.defaultVoice = voiceId;
				saveSettings(settings);
				ctx.ui.notify(`Default voice set to ${voiceId}`, "info");
				return;
			}

			// Separator
			if (choice === "---") return;

			// Voice switch — extract id from "PersonaName (voice-id) [active]"
			const idMatch = choice.match(/\(([^)]+)\)/);
			if (!idMatch) return;
			const voiceId = idMatch[1];
			if (!voices.has(voiceId)) return;

			activeVoice = voiceId;
			pi.appendEntry(ENTRY_TYPE, { voice: activeVoice } satisfies VoiceEntry);
			updateStatus(ctx, voices.get(activeVoice), activeVoice, settings.name);
			ctx.ui.notify(`Switched to ${voices.get(activeVoice)!.personaName}`, "info");
		},
	});

	// Inject active voice + user name into system prompt
	pi.on("before_agent_start", async (event) => {
		const voice = voices.get(activeVoice);
		if (!voice) return;

		const identityBlock = [
			`Your name is **${voice.personaName}**. Respond to "${voice.personaName}" naturally. Never refer to yourself as "the AI", "the assistant", or "Claude".`,
			`The user's name is **${settings.name}**. Always address them as ${settings.name}.`,
		].join("\n");

		return {
			systemPrompt:
				event.systemPrompt +
				`\n\n## Active Voice — ${voice.personaName}\n\n${identityBlock}\n\nThe following voice/persona is active. Follow these instructions for how you speak and present yourself.\n\n${voice.content}`,
		};
	});
}
