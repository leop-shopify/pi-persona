/**
 * Persona Extension
 *
 * Switch how the AI talks via /persona command.
 * Voices are markdown files in the voices/ directory.
 * Settings live in ~/.pi/agent/persona/settings.json.
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

	// Register /persona command — single entry point
	pi.registerCommand("persona", {
		description: "Switch AI voice/persona",
		handler: async (_args, ctx) => {
			const voiceNames = [...voices.keys()];

			// Build menu: settings first, then voices
			const options: string[] = [
				`Change name (current: ${settings.name})`,
				`Set default voice (current: ${settings.defaultVoice})`,
				"---",
				...voiceNames.map((v) => (v === activeVoice ? `${v} (active)` : v)),
			];

			const choice = await ctx.ui.select("Persona", options);
			if (!choice) return;

			// Change name
			if (choice.startsWith("Change name")) {
				const newName = await ctx.ui.input("Name:", settings.name);
				if (!newName) return;

				settings.name = newName;
				saveSettings(settings);
				updateStatus(ctx, activeVoice, settings.name);
				ctx.ui.notify(`Name set to ${settings.name}`, "info");
				return;
			}

			// Set default voice
			if (choice.startsWith("Set default voice")) {
				const defaultOptions = voiceNames.map((v) =>
					v === settings.defaultVoice ? `${v} (current default)` : v
				);

				const picked = await ctx.ui.select("Default voice:", defaultOptions);
				if (!picked) return;

				const voiceName = picked.replace(" (current default)", "");
				if (!voices.has(voiceName)) return;

				settings.defaultVoice = voiceName;
				saveSettings(settings);
				ctx.ui.notify(`Default voice set to ${voiceName}`, "info");
				return;
			}

			// Separator
			if (choice === "---") return;

			// Voice switch for this session
			const voiceName = choice.replace(" (active)", "");
			if (!voices.has(voiceName)) return;

			activeVoice = voiceName;
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
