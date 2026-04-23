/**
 * Persona Extension
 *
 * Switch how the AI talks via /persona command.
 * Voices are markdown files in the voices/ directory.
 * Settings live in ~/.pi/agent/persona/settings.json.
 *
 * Usage:
 *   /persona              — pick a voice from a list
 *   /persona rocky        — switch directly to a voice
 *   /persona name Leo     — set user name (persisted to settings.json)
 *   /persona name         — show current name
 *   /persona default hal  — set default voice (persisted to settings.json)
 *   /persona default      — show current default
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

function discoverVoices(): Map<string, string> {
	const voices = new Map<string, string>();
	if (!fs.existsSync(VOICES_DIR)) return voices;

	for (const file of fs.readdirSync(VOICES_DIR)) {
		if (!file.endsWith(".md")) continue;
		const name = file.replace(/\.md$/, "");
		const content = fs.readFileSync(path.join(VOICES_DIR, file), "utf-8");
		voices.set(name, content);
	}
	return voices;
}

function updateStatus(ctx: { ui: { setStatus(id: string, text: string): void } }, voice: string, userName: string) {
	ctx.ui.setStatus("persona", `voice: ${voice} | ${userName}`);
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

		updateStatus(ctx, activeVoice, settings.name);
	});

	// Register /persona command
	pi.registerCommand("persona", {
		description: "Switch AI voice/persona, or configure name/defaults",
		handler: async (args, ctx) => {
			const trimmed = args?.trim() ?? "";

			// Subcommand: /persona name [value]
			if (trimmed === "name" || trimmed.startsWith("name ")) {
				const newName = trimmed.slice(5).trim();

				if (!newName) {
					ctx.ui.notify(`Current name: ${settings.name}`, "info");
					return;
				}

				settings.name = newName;
				saveSettings(settings);
				updateStatus(ctx, activeVoice, settings.name);
				ctx.ui.notify(`Name set to ${settings.name}`, "info");
				return;
			}

			// Subcommand: /persona default [voice]
			if (trimmed === "default" || trimmed.startsWith("default ")) {
				const newDefault = trimmed.slice(8).trim();

				if (!newDefault) {
					ctx.ui.notify(`Default voice: ${settings.defaultVoice}`, "info");
					return;
				}

				if (!voices.has(newDefault)) {
					const available = [...voices.keys()].join(", ");
					ctx.ui.notify(`Unknown voice "${newDefault}". Available: ${available}`, "error");
					return;
				}

				settings.defaultVoice = newDefault;
				saveSettings(settings);
				ctx.ui.notify(`Default voice set to ${settings.defaultVoice}`, "info");
				return;
			}

			// Direct switch: /persona rocky
			if (trimmed && voices.has(trimmed)) {
				activeVoice = trimmed;
				pi.appendEntry(ENTRY_TYPE, { voice: activeVoice } satisfies VoiceEntry);
				updateStatus(ctx, activeVoice, settings.name);
				ctx.ui.notify(`Switched to ${activeVoice}`, "info");
				return;
			}

			// Unknown name passed
			if (trimmed) {
				const available = [...voices.keys()].join(", ");
				ctx.ui.notify(`Unknown voice "${trimmed}". Available: ${available}`, "error");
				return;
			}

			// No args: show picker
			const options = [...voices.keys()].map((name) =>
				name === activeVoice ? `${name} (active)` : name
			);

			const choice = await ctx.ui.select("Pick a voice:", options);
			if (!choice) return;

			const picked = choice.replace(" (active)", "");
			activeVoice = picked;
			pi.appendEntry(ENTRY_TYPE, { voice: activeVoice } satisfies VoiceEntry);
			updateStatus(ctx, activeVoice, settings.name);
			ctx.ui.notify(`Switched to ${activeVoice}`, "info");
		},
	});

	// Inject active voice + user name into system prompt
	pi.on("before_agent_start", async (event) => {
		const content = voices.get(activeVoice);
		if (!content) return;

		const nameDirective = `The user's name is **${settings.name}**. Always address them as ${settings.name}.\n\n`;

		return {
			systemPrompt:
				event.systemPrompt +
				`\n\n## Active Voice — ${activeVoice}\n\n${nameDirective}The following voice/persona is active. Follow these instructions for how you speak and present yourself.\n\n${content}`,
		};
	});
}
