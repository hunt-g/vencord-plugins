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

import { ApplicationCommandInputType, findOption, RequiredMessageOption } from "@api/Commands";
import definePlugin from "@utils/types";

const PROXY = "https://cors.proxy.consumet.org/";

const HTTPS_REGEX = /(?:\s|^)https?:\/\//;
const LRANGE_REGEX = /([a-zA-Z0-9-_.#/]*)/g;

const GITHOSTS: Array<{ regex: RegExp, replacements: [string, string][]; }> = [
    {
        regex: mergeRegexes([HTTPS_REGEX, /(www\.)?github\.com\/.+?\/.+?\/blob\//, LRANGE_REGEX]),
        replacements: [["/blob/", "/raw/"]],
    },
    {
        regex: mergeRegexes([HTTPS_REGEX, /.+?\/.+?\/-\/blob\//, LRANGE_REGEX]),
        replacements: [["/blob/", "/raw/"]],
    },
    {
        regex: mergeRegexes([HTTPS_REGEX, /.+?\/.+?\/.+?\/src\/branch\//, LRANGE_REGEX]),
        replacements: [["/src/", "/raw/"]],
    },
];

function mergeRegexes(regexes: RegExp[]): RegExp {
    return new RegExp(regexes.map(r => r.source).join(""), "g");
}

function replaceAll(str: string, replacements: [string, string][]): string {
    for (const [from, to] of replacements) {
        str = str.replace(from, to);
    }
    return str;
}

function getRawUrl(url: string): string {
    for (const host of Object.values(GITHOSTS)) {
        const match = host.regex.exec(url);
        if (match) { return replaceAll(match[0], host.replacements); }
    }
    return "";
}

function getFileInfo(url: string): { name: string; ext: string; lineStart?: number; lineEnd?: number; } {
    const matches = url.match(/([a-zA-Z0-9-_.]+)(?:#L(\d+)(?:-[L]?(\d+))?)?$/);
    if (!matches) return { name: "", ext: "" };
    var [filename, ext] = matches[1].split(".");
    return {
        name: filename,
        ext: ext ?? "",
        lineStart: matches[2] ? (parseInt(matches[2]) - 1) : undefined,
        lineEnd: matches[3] ? parseInt(matches[3]) : undefined,
    };
}

function unindent(block: string): string {
    block = block.replace(/\t/g, "    ");
    const minIndent = block.match(/^ *(?=\S)/gm)?.reduce((prev, curr) => Math.min(prev, curr.length), Infinity) ?? 0;
    if (!minIndent) return block;
    return block.replace(new RegExp(`^ {${minIndent}}`, "gm"), "");
}

async function fetchLines(url: string, start: number, end: number) {
    const res = await fetch(PROXY + url);
    const lines = (await res.text())?.split("\n");
    return {
        code: lines.slice(start, end).join("\n").replace("```", "~~~"), // prevent code block escape in discord
        count: lines.length
    };
}

async function gitPreview(url: string): Promise<string> {
    const rawUrl = getRawUrl(url);
    var { name, ext, lineStart, lineEnd } = getFileInfo(rawUrl);
    const { code, count } = await fetchLines(rawUrl, lineStart ?? 1, lineEnd ?? 1);
    return [
        `**${name}` + (ext ? `.${ext}` : "") + "**",
        `${count > 1 ? "Lines" : "Line"}:`,
        (lineStart ? `${lineStart + 1}` : ""),
        (lineEnd ? `-${lineEnd}` : ""),
        `\n\`\`\`${ext}\n${unindent(code)}\n\`\`\``,
        url
    ].join(" ");
}

export default definePlugin({
    name: "GitCodePreview",
    description: "Send code block previews for git links with line ranges",
    inputType: ApplicationCommandInputType.BUILT_IN_TEXT,
    authors: [{ name: "hunter", id: 222800179697287168n }],
    dependencies: ["CommandsAPI"],
    commands: [
        {
            name: "gitcat",
            description: "Send lines of code from a git link as a code block.",
            options: [RequiredMessageOption],
            execute: async opts => ({
                content: await gitPreview(findOption(opts, "message", "")),
            }),
        },
    ],
});
