/**
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { addPreSendListener, MessageObject, removePreSendListener } from "@api/MessageEvents";
import { Settings } from "@api/settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";


const PROXY = "https://cors.consumet.stream/";
const GIT_REGEX = /^(?:https?:\/\/)(?:www\.)?([^/]+).([^/]+).([^/]+)(.+(?=.*\/).)+([^#]+?(?:\.([^#]{1,4})?)?)(?:#L(?:ines-)?(\d+)(?:-L?(\d+))?)?$/gim;


interface Keys {
    url: string;
    host: string;
    user: string;
    repo: string;
    path: string;
    file: string;

    // Optional
    ext?: string;
    lineStart?: number;
    lineEnd?: number;

    // Post-processed
    rawUrl?: string;
    code?: string;
    codeLang?: string; // Highlight language for code block
    codeBlock?: string;
    linesLabel?: string;
}


const FormatKeys = ["url", "host", "user", "repo", "path", "file", "ext", "lineStart", "lineEnd", "rawUrl", "code", "codeLang", "codeBlock", "linesLabel"];


// Not sure of the lifetime of these lol
const matchStore: Record<string, Keys> = {}; // For duplicate matches
const rawStore: Record<string, string> = {}; // For matches that have already been fetched


export default definePlugin({
    name: "GitPreview",
    authors: [Devs.hunt],
    description: "Sends a preview of a Git file when you send a link to it",
    dependencies: ["MessageEventsAPI"],
    options: {
        defaultHighlight: {
            description: "Fallback highlight language to use when no language is specified",
            type: OptionType.STRING,
            default: "sh",
            restartNeeded: false,
        },
        defaultLength: {
            description: "Amount of lines to show when no line range is specified",
            type: OptionType.NUMBER,
            default: 1,
            restartNeeded: false,
        },
        maximumLength: {
            description: "Maximum amount of lines to show in a preview",
            type: OptionType.NUMBER,
            default: 25,
            restartNeeded: false,
        },
        messageFormat: {
            description: "Format of the message to send. Preview already includes newlines before and after.",
            help: "Keys: " + FormatKeys.join(", "),
            type: OptionType.STRING,
            default: "**${file}** ${linesLabel}: ${lineStart}-${lineEnd}${codeBlock}<${url}>",
            restartNeeded: false,
        },
        replaceTripleBackticks: {
            description: "Replace all triple backticks within snippets with this string. Set to empty string to disable.",
            type: OptionType.STRING,
            default: "~~~",
            restartNeeded: false,
        },
        sendAsFile: {
            description: "Send the preview as a file instead of a code block (Not Implemented)",
            type: OptionType.BOOLEAN,
            default: false,
            restartNeeded: false,
        },
    },

    async codePreview(msg: MessageObject): Promise<void> {
        const { messageFormat } = Settings.plugins.GitPreview;

        let keys: Keys;
        const matched: string[] = [];

        for (const match of [...msg.content.matchAll(GIT_REGEX)]) {
            if (matched.includes(match[0])) continue; // Skip duplicate matches
            matched.push(match[0]);

            if (!(keys = await this.makeKeys(match))) continue; // Invalid or unsupported URL
            const preview = messageFormat.replace(/\$\{([^}]+)\}/g, (m: string, k: string) => keys[k] ?? "");
            msg.content = msg.content.replaceAll(keys.url, preview);
        }

        if (msg.content.length > 1995) {
            msg.content = msg.content.slice(0, 1995);
            msg.content = msg.content.slice(0, msg.content.lastIndexOf("\n")) + "\n...";
        }
    },

    async makeKeys(arr: Array<string> | RegExpMatchArray): Promise<Keys> {
        const { defaultHighlight } = Settings.plugins.GitPreview;

        const keys: Keys = {
            url: arr[0],
            host: arr[1],
            user: arr[2],
            repo: arr[3],
            path: arr[4],
            file: arr[5],
            ext: arr[6],
            lineStart: arr[7] ? parseInt(arr[7]) : undefined,
            lineEnd: arr[8] ? parseInt(arr[8]) : undefined,
        };

        if (!(keys.rawUrl = this.makeRawUrl(keys))) return keys;
        const rawCode = rawStore[keys.rawUrl] ?? await this.fetchRaw(keys.rawUrl); // Use cached code if possible
        keys.code = this.makeCode(rawCode, keys.lineStart ?? 1, keys.lineEnd ?? undefined);
        keys.codeLang = keys.ext ?? defaultHighlight;
        keys.codeBlock = `\n\`\`\`${keys.ext}\n${keys.code}\n\`\`\`\n`;
        keys.linesLabel = keys.lineStart && keys.lineEnd ? "Lines" : "Line";

        matchStore[keys.url] = keys;
        return keys;
    },


    makeRawUrl(keys: Keys): string | undefined {
        const { host, user, url, repo, path, file } = keys;
        const deblobbed = path.replace("/blob/", "")
        switch (host) {
            case "bitbucket.org": // No.
                return;
            case "github.com":

                return `https://raw.githubusercontent.com/${user}/${repo}/${deblobbed}${file}`;
            default: // gitlab.com, etc.
                return url.replace("/blob/", "/raw/");
        }
    },

    async fetchRaw(url: string): Promise<string> {
        console.log(url)
        const res = await fetch(url);
        if (!res.ok) throw new Error("Failed to fetch raw file. Check your URL.");

        return rawStore[url] = await res.text();
    },

    makeCode(text: string, lineStart: number, lineEnd: number | undefined): string {
        const { defaultLines, maxLines } = Settings.plugins.GitPreview;
        lineEnd = Math.min(lineEnd ?? lineStart + defaultLines, lineStart + maxLines);

        let lines = text.split("\n");
        lines = lines.slice(lineStart - 1, lineEnd);
        text = lines.join("\n").trim();
        return text;
    },


    start() {
        this.preSend = addPreSendListener(async (_, msg) => { await this.codePreview(msg); });

        // TODO: Use messageFormat to edit instead of url once edited by preSend
        // this.preEdit = addPreEditListener(async (_cid, _mid, msg) => { await this.codePreview(msg); });
    },

    stop() {
        removePreSendListener(this.preSend);

        // TODO: As above
        // removePreEditListener(this.preEdit);
    },
});
