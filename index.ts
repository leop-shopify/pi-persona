/**
 * Persona Extension
 *
 * Switch how the AI talks via /persona command.
 * Voices are markdown files in the voices/ directory.
 * Settings live in ~/.pi/agent/persona/settings.json.
 * Every change writes directly to settings.json — one source of truth.
 *
 * Usage:
 *   /persona — opens a menu to switch voice or change name
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const VOICES_DIR = path.join(path.dirname(import.meta.url.replace("file://", "")), "voices");
const SETTINGS_DIR = path.join(os.homedir(), ".pi", "agent", "persona");
const SETTINGS_PATH = path.join(SETTINGS_DIR, "settings.json");

interface Settings {
	name: string;
	voice: string;
}

interface Voice {
	content: string;
	personaName: string;
}

function loadSettings(): Settings {
	try {
		const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
		const parsed = JSON.parse(raw);
		return {
			name: parsed.name ?? "User",
			voice: parsed.voice ?? parsed.defaultVoice ?? "friday",
		};
	} catch {
		return { name: "User", voice: "friday" };
	}
}

function saveSettings(settings: Settings) {
	fs.mkdirSync(SETTINGS_DIR, { recursive: true });
	fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

function parsePersonaName(content: string, fallback: string): string {
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
	let voices = discoverVoices();

	pi.on("session_start", async (_event, ctx) => {
		settings = loadSettings();
		voices = discoverVoices();
		updateStatus(ctx, voices.get(settings.voice), settings.voice, settings.name);
	});

	pi.registerCommand("persona", {
		description: "Switch AI voice/persona",
		handler: async (_args, ctx) => {
			settings = loadSettings();
			const voiceIds = [...voices.keys()];

			const options: string[] = [
				`Change name (current: ${settings.name})`,
				"---",
				...voiceIds.map((id) => {
					const voice = voices.get(id)!;
					const label = `${voice.personaName} (${id})`;
					return id === settings.voice ? `${label} [active]` : label;
				}),
			];

			const choice = await ctx.ui.select("Persona", options);
			if (!choice) return;

			if (choice.startsWith("Change name")) {
				const newName = await ctx.ui.input("Name:", settings.name);
				if (!newName) return;

				settings.name = newName;
				saveSettings(settings);
				updateStatus(ctx, voices.get(settings.voice), settings.voice, settings.name);
				ctx.ui.notify(`Name set to ${settings.name}`, "info");
				return;
			}

			if (choice === "---") return;

			const idMatch = choice.match(/\(([^)]+)\)/);
			if (!idMatch) return;
			const voiceId = idMatch[1];
			if (!voices.has(voiceId)) return;

			settings.voice = voiceId;
			saveSettings(settings);
			updateStatus(ctx, voices.get(settings.voice), settings.voice, settings.name);
			ctx.ui.notify(`Switched to ${voices.get(voiceId)!.personaName}`, "info");
		},
	});

	pi.on("before_agent_start", async (event) => {
		settings = loadSettings();
		const voice = voices.get(settings.voice);
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
