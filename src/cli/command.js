// ABOUTME: Turns island command lines into D-Bus method calls and reads gdbus results back.
// ABOUTME: Pure functions shared by bin/island and the end-to-end tests.

export const USAGE = `usage:
  island list
  island foreground
  island state <plugin>
  island <plugin> <action> [--option value ...]

examples:
  island pomodoro toggle
  island activities push --id build --title "cargo build" --progress 0.4
  island activities end --id build`;

const camelCase = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

function parseOptions(words) {
    const options = {};
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (!word.startsWith('--'))
            throw new Error(`unexpected argument: ${word}`);
        const equals = word.indexOf('=');
        if (equals !== -1) {
            options[camelCase(word.slice(2, equals))] = word.slice(equals + 1);
            continue;
        }
        const value = words[i + 1];
        if (value === undefined || value.startsWith('--'))
            throw new Error(`${word} needs a value`);
        options[camelCase(word.slice(2))] = value;
        i++;
    }
    return options;
}

export function parseCommand(argv) {
    const [first, second, ...rest] = argv;
    if (first === 'list' && second === undefined)
        return {method: 'ListPlugins', args: []};
    if (first === 'foreground' && second === undefined)
        return {method: 'GetForeground', args: []};
    if (first === 'state' && second !== undefined && rest.length === 0)
        return {method: 'GetState', args: [second]};
    if (first === undefined || second === undefined || first === 'state')
        throw new Error(USAGE);

    if (rest.length === 0)
        return {method: 'Activate', args: [first, second]};
    return {method: 'Send', args: [first, second, JSON.stringify(parseOptions(rest))]};
}

const ESCAPES = {n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"'};

// Undoes GVariant text escaping inside a quoted string literal.
function unescapeGVariant(text) {
    return text.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|.)/g, (_, code) =>
        code.length > 1 ? String.fromCodePoint(parseInt(code.slice(1), 16)) : ESCAPES[code] ?? code);
}

const STRING_LITERAL = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;

function stringLiterals(output) {
    return [...output.matchAll(STRING_LITERAL)].map(match => unescapeGVariant(match[1] ?? match[2]));
}

// gdbus prints a single string result as ('value',)
export function parseGdbusString(output) {
    const [value] = stringLiterals(output);
    if (value === undefined)
        throw new Error(`not a gdbus string result: ${output}`);
    return value;
}

// gdbus prints a string array result as (['a', 'b'],) or (@as [],)
export function parseGdbusStringArray(output) {
    return stringLiterals(output);
}
