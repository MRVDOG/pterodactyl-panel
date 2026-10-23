/**
 * Lets components hide console output they triggered themselves, such as replies to
 * commands sent in the background, from the console view.
 */
type ConsoleFilter = (line: string) => boolean;

const filters = new Set<ConsoleFilter>();

export const registerConsoleFilter = (filter: ConsoleFilter): (() => void) => {
    filters.add(filter);

    return () => {
        filters.delete(filter);
    };
};

export const isConsoleLineFiltered = (line: string): boolean => {
    for (const filter of filters) {
        if (filter(line)) return true;
    }

    return false;
};

// eslint-disable-next-line no-control-regex
const FORMATTING_PATTERN = /\u001b\[[0-9;]*m|§[0-9a-fk-or]/gi;

export const stripFormatting = (line: string): string => line.replace(FORMATTING_PATTERN, '');
