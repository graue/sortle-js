// Expressions can be multi-line due to my extension (not in the spec)
// to allow ending a line with a backslash (not part of a string literal
// or comment) to ignore the newline in parsing. This structure tracks
// what we've read of the current expression, over multiple lines.
function blankExpression() {
  return {
    name: null,
    haveReadSeparator: false,
    terms: [],
  };
}

class SortleSyntaxError extends Error {
  constructor(row, col, expected, received = null) {
    super();
    this.row = row;
    this.col = col;
    this.expected = expected;
    this.received = received;
  }
}

class BadStringEscapeError extends Error {
  constructor(offset) {
    super();
    this.offset = offset;
  }
}

function sortleUnescape(str) {
  return str.replace(/\\(..)/g, (match, p1, offset, _str) => {
    if (!p1.match(/[0-9A-Fa-f]{2}/)) {
      throw new BadStringEscapeError(offset);
    }
    return String.fromCharCode(parseInt(p1, 16));
  });
}

const OPERATORS = [
  '+',
  '*',
  '/',
  '%',
  '^',
  '~',
  '?',
  '$',
];

function parseSortleProgram(code) {
  // constructed in this function, flattened to array at end, and returned
  const expressions = {};

  let expression = blankExpression();
  let row = 0;
  let col = 0;

  const codeLines = code.split('\n');

  while (row < codeLines.length) {
    const line = codeLines[row];

    // Skip whitespace
    col += line.substr(col).match(/^\s*/)[0].length;

    if (col === line.length || line[col] === '#') {  // End of line or comment
      if (!expression.name) {
        row++;
        col = 0;
        continue;  // Blank line, OK
      } else if (!expression.haveReadSeparator) {
        throw new SortleSyntaxError(row, col, ':=', 'end of line');
      } else if (expression.terms.length === 0) {
        throw new SortleSyntaxError(row, col, 'expression', 'end of line');
      }
      expressions[expression.name] = expression.terms;
      expression = blankExpression();
      row++;
      col = 0;
      continue;
    } else if (line[col] === '\\' && col + 1 === line.length) {
      // A backslash on the very end of a line continues the line.
      // (Extension to 2005 spec)
      row++;
      col = 0;
      continue;
    } else if (!expression.name) {
      // Need name of an expression
      const matches = line.substr(col).match(/^[A-Za-z]+/);
      if (!matches) {
        throw new SortleSyntaxError(row, col, 'expression name');
      }
      expression.name = matches[0];
      col += matches[0].length;

      // Error if not-whitespace after
      if (line.length > col && line[col] != ' ' && !(
        line[col] === '\\' && line.length === col + 1
      )) {
        throw new SortleSyntaxError(
          row,
          col - matches[0].length,
          'expression name',
          matches[0],
        );
      }
    } else if (!expression.haveReadSeparator) {
      if (line.substr(col, 2) === ':=') {
        col += 2;
        expression.haveReadSeparator = true;

        // Error if not-whitespace after
        if (line.length > col && line[col] != ' ' && !(
          line[col] === '\\' && line.length === col + 1
        )) {
          throw new SortleSyntaxError(row, col, 'whitespace');
        }
      } else {
        throw new SortleSyntaxError(row, col, ':=');
      }
    } else if (line[col] === '"') {
      const matches = line.substr(col).match(/^"([^"]*)"/);
      if (!matches) {
        throw new SortleSyntaxError(row, col, 'string', 'unterminated string');
      }
      const rawString = matches[1];
      let unescapedString;
      try {
        unescapedString = sortleUnescape(rawString);
      } catch (e) {
        if (e instanceof BadStringEscapeError) {
          throw new SortleSyntaxError(
            row,
            col + 1 + e.offset + 1,
            'escape sequence (two hexadecimal digits)',
            '"' + rawString.substr(e.offset + 1, 2),
          );
        } else {
          throw e;
        }
      }
      expression.terms.push(unescapedString);
      col += matches[0].length;

      // Error if not-whitespace after
      if (line.length > col && line[col] != ' ' && !(
        line[col] === '\\' && line.length === col + 1
      )) {
        throw new SortleSyntaxError(row, col, 'whitespace');
      }
    } else if (OPERATORS.some(operator => line[col] === operator)) {
      expression.terms.push({
        type: 'operator',
        value: line[col],
      });
      col++;
      // Error if not-whitespace after
      if (line.length > col && line[col] != ' ' && !(
        line[col] === '\\' && line.length === col + 1
      )) {
        throw new SortleSyntaxError(row, col, 'whitespace');
      }
    } else if (line[col].match(/^\d/)) {
      const number = line.substr(col).match(/^\d+/)[0];
      expression.terms.push(Number(number)); // TODO: Make it mod 2**32?
      col += number.length;
      // Error if not-whitespace after
      if (line.length > col && line[col] != ' ' && !(
        line[col] === '\\' && line.length === col + 1
      )) {
        throw new SortleSyntaxError(row, col, 'whitespace');
      }
    } else {
      throw new SortleSyntaxError(row, col, 'term');
    }
  }

  return Object.keys(expressions).sort().map(name => [name, expressions[name]]);
}

module.exports.parseSortleProgram = parseSortleProgram;
module.exports.SortleSyntaxError = SortleSyntaxError;
