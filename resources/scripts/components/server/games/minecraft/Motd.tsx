import React from 'react';
import { ChatComponent } from '@/api/server/minecraft';

const COLORS: Record<string, string> = {
    black: '#000000',
    dark_blue: '#0000AA',
    dark_green: '#00AA00',
    dark_aqua: '#00AAAA',
    dark_red: '#AA0000',
    dark_purple: '#AA00AA',
    gold: '#FFAA00',
    gray: '#AAAAAA',
    dark_gray: '#555555',
    blue: '#5555FF',
    green: '#55FF55',
    aqua: '#55FFFF',
    red: '#FF5555',
    light_purple: '#FF55FF',
    yellow: '#FFFF55',
    white: '#FFFFFF',
};

const LEGACY_CODES: Record<string, string> = {
    '0': 'black',
    '1': 'dark_blue',
    '2': 'dark_green',
    '3': 'dark_aqua',
    '4': 'dark_red',
    '5': 'dark_purple',
    '6': 'gold',
    '7': 'gray',
    '8': 'dark_gray',
    '9': 'blue',
    a: 'green',
    b: 'aqua',
    c: 'red',
    d: 'light_purple',
    e: 'yellow',
    f: 'white',
};

interface Style {
    color?: string;
    bold?: boolean;
    italic?: boolean;
    underlined?: boolean;
    strikethrough?: boolean;
}

interface Segment extends Style {
    text: string;
}

/**
 * Splits text using legacy § formatting codes into styled segments.
 */
const fromLegacy = (text: string, base: Style): Segment[] => {
    const segments: Segment[] = [];
    let style: Style = { ...base };

    text.split(/(§[0-9a-fk-or])/i).forEach((part) => {
        const code = part.match(/^§([0-9a-fk-or])$/i)?.[1].toLowerCase();
        if (!code) {
            if (part) segments.push({ ...style, text: part });
        } else if (LEGACY_CODES[code]) {
            style = { color: LEGACY_CODES[code] };
        } else if (code === 'r') {
            style = { ...base };
        } else if (code === 'l') {
            style = { ...style, bold: true };
        } else if (code === 'o') {
            style = { ...style, italic: true };
        } else if (code === 'n') {
            style = { ...style, underlined: true };
        } else if (code === 'm') {
            style = { ...style, strikethrough: true };
        }
    });

    return segments;
};

const flatten = (component: ChatComponent, inherited: Style = {}): Segment[] => {
    if (typeof component === 'string') {
        return fromLegacy(component, inherited);
    }

    const style: Style = {
        color: component.color ?? inherited.color,
        bold: component.bold ?? inherited.bold,
        italic: component.italic ?? inherited.italic,
        underlined: component.underlined ?? inherited.underlined,
        strikethrough: component.strikethrough ?? inherited.strikethrough,
    };

    return [
        ...fromLegacy(component.text ?? '', style),
        ...(component.extra ?? []).reduce<Segment[]>((all, child) => all.concat(flatten(child, style)), []),
    ];
};

/**
 * Renders a server's MOTD with its colours and formatting, as shown in the multiplayer menu.
 */
export default ({ motd }: { motd: ChatComponent }) => (
    <span className={'whitespace-pre-line'}>
        {flatten(motd).map((segment, index) => (
            <span
                key={index}
                style={{
                    color: segment.color ? COLORS[segment.color] ?? segment.color : undefined,
                    fontWeight: segment.bold ? 700 : undefined,
                    fontStyle: segment.italic ? 'italic' : undefined,
                    textDecoration:
                        [segment.underlined && 'underline', segment.strikethrough && 'line-through']
                            .filter(Boolean)
                            .join(' ') || undefined,
                }}
            >
                {segment.text}
            </span>
        ))}
    </span>
);
