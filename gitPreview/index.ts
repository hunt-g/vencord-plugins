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

import { findOption, RequiredMessageOption } from "@api/Commands";
import definePlugin from "@utils/types";


const GITHOSTS: Array<{ regex: RegExp, replacements: [string, string][]; }> = [
    {
        regex: /(?:\s|^)https?:\/\/(www\.)?github\.com\/.+?\/.+?\/blob\/([a-zA-Z0-9-_.#/]*)/g,
        replacements: [
            ["/blob/", "/raw/"],
        ],
    },
    {
        regex: /(?:\s|^)https?:\/\/.+?\/.+?\/.+?\/-\/blob\/([a-zA-Z0-9-_.#/]*)/g,
        replacements: [
            ["/blob/", "/raw/"],
        ],
    },
    {
        regex: /(?:\s|^)https?:\/\/.+?\/.+?\/.+?\/src\/branch\/([a-zA-Z0-9-_.#/]*)/g,
        replacements: [
            ["/src/", "/raw/"],
        ],
    },
];

// convert file url to raw file url
function getRawUrl(url: string): string {
    for (const host of Object.values(GITHOSTS)) {
        const match = host.regex.exec(url);
        if (match) {
            for (const [from, to] of host.replacements) {
                url = url.replace(from, to);
            }
            return url;
        }
    }
    return url;
}

// get file name, extension, and optional line start/end from url
function getFileInfo(url: string): { name: string; ext: string; lineStart?: number; lineEnd?: number; } {
    const match = url.match(/(?:\/|\\)([a-zA-Z0-9-_.]+)(?:#L(\d+)(?:-L(\d+))?)?$/);
    if (!match) return { name: "", ext: "" };
    return {
        name: match[1],
        ext: match[1].split(".").pop() ?? "",
        lineStart: match[2] ? parseInt(match[2]) : undefined,
        lineEnd: match[3] ? parseInt(match[3]) : undefined,
    };
}

// unindent code block with leading whitespace
function unindent(block: string): string {
    block = block.replace(/\t/g, "    ");
    const minIndent = block.match(/^ *(?=\S)/gm)
        ?.reduce((prev, curr) => Math.min(prev, curr.length), Infinity) ?? 0;

    if (!minIndent) return block;
    return block.replace(new RegExp(`^ {${minIndent}}`, "gm"), "");
}

// convert url, fetch file, trim to line range, and return as code block
async function sendCodeBlock(url: string): Promise<string> {
    const { name, ext, lineStart, lineEnd } = getFileInfo(url);
    const response = await fetch("https://cors.proxy.consumet.org/" + url);
    const text = await response.text();
    const lines = text.split("\n");
    const code = lines.slice(lineStart ?? 0, lineEnd ?? 26).join("\n");
    const title = `**${name}**` + (lineStart ? `:${lineStart}` : "") + (lineEnd ? `-${lineEnd}` : "");
    return `${title}\n\`\`\`${ext}\n${unindent(code)}\n\`\`\``;
}

export default definePlugin({
    name: "GitCodePreview",
    description: "Send code block previews for git links with line ranges",
    authors: [{ name: "hunter", id: 222800179697287168n }],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "gitcurl",
            description: "Git file url with line range",
            options: [RequiredMessageOption],
            execute: async opts => ({
                content: await sendCodeBlock(getRawUrl(findOption(opts, "message", ""))),
            }),
        },
    ],
});

console.log("GitCodePreview loaded");
