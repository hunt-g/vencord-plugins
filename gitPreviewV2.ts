/*
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


import { addPreEditListener, addPreSendListener, removePreEditListener, removePreSendListener } from "@api/MessageEvents";
import { Settings } from "@api/settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

const PROXY = "https://cors.proxy.consumet.org/";
const GIT_PARSE_REGEX = /^(?:https?:\/\/)?(?:www\.)?([^/]+).([^/]+).([^/]+)(.+(?=.*\/).)+([^#]+?(?:\.([^#]{1,4})?)?)(?:#L(?:ines-)?(\d+)(?:-L?(\d+))?)?$/gim;

const SETTINGS = Settings.plugins.GithubPreview;

const messageFormat = SETTINGS.messageFormat.length
    ? SETTINGS.messageFormat
    : SETTINGS.messageFormat.default;

export default definePlugin({
    name: "GitPreview",
    authors: [Devs.hunt],
    description: "Sends a preview of a Git file when you send a link to it",
    dependencies: ["MessageEventsAPI"],

    options: {
        defaultHighlight: {
            description:
                "Fallback highlight language to use when no language is specified",
            type: OptionType.STRING,
            default: "sh",
            restartNeeded: false,
        },
        defaultLines: {
            description: "Amount of lines to show when no line range is specified",
            type: OptionType.NUMBER,
            default: 1,
            restartNeeded: false,
        },
        maxLines: {
            description: "Maximum amount of lines to show in a preview",
            type: OptionType.NUMBER,
            default: 25,
            restartNeeded: false,
        },
        messageFormat: {
            description:
                "Format of the message to send. Preview already includes newlines before and after.",
            help: "Available variables: ${url}, ${host}, ${user}, ${repo}, ${file}, ${raw}, ${ext}, ${preview}, ${linesLabel}, ${lineStart}, ${lineEnd}",
            type: OptionType.STRING,
            default:
                "**${file}** ${linesLabel}: ${lineStart}-${lineEnd}${code}${url}\n",
            restartNeeded: false,
        },
        replaceTripleBackticks: {
            description:
                "Replace all triple backticks within snippets with this string. Set to empty string to disable.",
            type: OptionType.STRING,
            default: "~~~",
            restartNeeded: false,
        },
        sendFile: {
            description:
                "Send the preview as a file instead of a code block (Not Implemented)",
            type: OptionType.BOOLEAN,
            default: false,
            restartNeeded: false,
        },
    },

    async githubPreview(m: RegExpMatchArray): Promise<string> {
        const keys = {
            url: m[0],
            raw: m[0],
            host: m[1],
            user: m[2],
            repo: m[3],
            path: m[4],
            file: m[5],
            ext: m[6] ?? SETTINGS.defaultHighlight,
            lineStart: m[7] ? parseInt(m[7]) : 1,
            lineEnd: m[8] ? parseInt(m[8]) : SETTINGS.defaultLines,
            preview: "",
            linesLabel: "",
        };
        switch (keys.host) {
            default: keys.raw = keys.raw.replace("/blob/", "/raw/");
        }

        keys.lineEnd = Math.min(keys.lineEnd, keys.lineStart + SETTINGS.maxLines);
        const _rawCode: string = await fetch(PROXY + keys.raw)
            .then(res => res.text())
            .then(text => text.split("\n"))
            .then(lines => lines.slice(keys.lineStart - 1, keys.lineEnd))
            .then(lines => lines.join("\n"));

        keys.linesLabel = "Line" + (keys.lineEnd - keys.lineStart > 1 ? "s" : "");
        keys.preview = `\n\`\`\`${keys.ext}\n${_rawCode}\n\`\`\`\n`;
        return messageFormat.replace(/\$\{([^}]+)\}/g, (m, k) => keys[k] ?? m);
    },

    // Below this line no worky

    start() {
        this.preSend = addPreSendListener((_, msg) => {
            if (!msg.content.includes("https://")) return;
            for (const match of msg.content.matchAll(GIT_PARSE_REGEX)) {
                console.log("MATCH: ", match); // ! DEBUG

                this.githubPreview(match).then(formatted => {
                    console.log("FORMATTED: ", formatted); // ! DEBUG
                    msg.content = msg.content.replace(match[0], formatted);
                });
            }
        });

        this.preEdit = addPreEditListener((_, msg) => {
            if (!msg.includes("https://")) return;
            for (const match of msg.matchAll(GIT_PARSE_REGEX)) {
                console.log("MATCH: ", match); // ! DEBUG

                this.githubPreview(match).then(formatted => {
                    console.log("FORMATTED: ", formatted); // ! DEBUG
                    msg = msg.replace(match[0], formatted);
                });
            }
        });
    },

    stop() {
        removePreSendListener(this.preSend);
        removePreEditListener(this.preEdit);
    },
});
