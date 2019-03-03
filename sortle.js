#!/usr/bin/env node

const {readFileSync} = require('fs');
const {SortleSyntaxError, parseSortleProgram} = require('./lib/parse');
const {SortleRegexError, evalRegex} = require('./lib/regex');

main(process.argv);



function main(argv) {
  if (argv[2]) {
    runSortleFile(argv[2]);
  } else {
    usage();
  }
}

function usage() {
  console.log('usage: sortle myprogram.sort');
}

function runSortleFile(filename) {
  const code = readFileSync(filename, 'utf8');

  let program;
  try {
    program = parseSortleProgram(code);
  } catch (e) {
    if (e instanceof SortleSyntaxError) {
      console.error(code.split('\n')[e.row]);
      let whitespace = '';
      for (let i = 0; i < e.col; i++) {
        whitespace += ' ';
      }
      console.error(`${whitespace}^`);
      console.error('');

      const basename = filename.match(/[^/\\]+$/)[0];

      console.error(`${basename}:${e.row + 1}:${e.col + 1}: error`);
      console.error(`  expected: ${e.expected}`);
      if (e.received) {
        console.error(`  received ${e.received}`);
      }
      process.exit(1);
    } else {
      throw e;
    }
  }

  executeSortleProgram(program);
}

// A program, or program state, is an array of [expression name, expression]
// tuples.
//
// An expression is an array of this union:
//  number | string | {
//    type: 'operator',
//    value: '+' | '*' | '/' | '%' | '^' | '~' | '?' | '$',
//  }

function executeSortleProgram(expressions) {
  if (expressions.length === 0) {
    console.error('program must have at least one expression');
    process.exit(1);
  }

  // Make a copy to reuse program code as program state
  expressions = [...expressions];

  let ip = 0;
  while (expressions.length > 1) {
    const [_name, terms] = expressions[ip];
    const newName = sortleString(evaluate(terms, expressions, ip));
    const newEntry = [newName, terms];

    expressions.splice(ip, 1);
    if (newName !== '') {
      let indexToInsertBefore = expressions.findIndex(otherExpression => (
        otherExpression[0] >= newName
      ));
      if (indexToInsertBefore === -1) {
        indexToInsertBefore = expressions.length;
      }
      const clobbering = (
        indexToInsertBefore < expressions.length &&
        expressions[indexToInsertBefore][0] === newName
      );
      expressions.splice(
        indexToInsertBefore,
        clobbering ? 1 : 0,
        newEntry,
      );
      ip = indexToInsertBefore + 1;
    }

    if (ip === expressions.length) {
      ip = 0;
    }
  }

  // Print name of final expression
  console.log(expressions[0][0]);
}

function sortleString(input) {
  if (typeof input === 'string') {
    return input;
  } else if (input === 0) {
    // Weird Sortle stringification behavior for 0 is the only reason this
    // function exists.
    return '';
  } else {
    return String(input);
  }
}

function sortleNumber(input) {
  if (typeof input === 'number') {
    return input;
  }
  // Unlike the built-in JS conversion, which will fall back to NaN, Sortle
  // treats any non-numeric string as 0, and if a string begins with one or
  // more digits, Sortle will interpret those as a number, ignoring any
  // non-numeric parts that come after.
  return Number('0' + input.match(/^[0-9]*/)[0]);
}

function evaluate(terms, expressions, ip) {
  const stack = [];

  for (const term of terms) {
    if (typeof term === 'string' || typeof term === 'number') {
      stack.push(term);
      continue;
    }

    if (stack.length < 2) {
      console.error(
        `cannot execute ${term.value}: ` +
        `need 2 elements on stack, have ${stack.length}`
      );
      process.exit(1);
    }
    const op1 = stack.pop();
    const op2 = stack.pop();
    if (term.value === '+') {
      stack.push(sortleNumber(op1) + sortleNumber(op2));
    } else if (term.value === '*') {
      stack.push(sortleNumber(op1) * sortleNumber(op2));
    } else if (term.value === '/') {
      stack.push(Math.floor(sortleNumber(op1) / sortleNumber(op2)));
    } else if (term.value === '%') {
      stack.push(sortleNumber(op1) % sortleNumber(op2));
    } else if (term.value === '^' || term.value === '$') {
      const sop1 = sortleString(op1);
      const sop2 = sortleString(op2);
      stack.push(sop1 > sop2 ? sop1 : sop2);
    } else if (term.value === '~') {
      stack.push(sortleString(op2) + sortleString(op1));
    } else if (term.value === '?') {
      if (sortleString(op1) !== '') {
        throw new Error('substring regex form not implemented');
      }

      // According to an older spec, the order of testing is reverse order,
      // starting prior to instruction pointer.
      const expressionsToMatch =
        expressions.slice(0, ip)
          .reverse()
          .concat(expressions.slice(ip + 1).reverse());

      let regexResult;
      try {
        regexResult = evalRegex(
          sortleString(op2),
          expressionsToMatch.map(([name, terms]) => name),
        );
      } catch (e) {
        if (e instanceof SortleRegexError) {
          console.error(`error: ${e.message}`);
          console.error(`when evaluating regex: ${e.regex}`);
          process.exit(1);
        } else {
          throw e;
        }
      }
      stack.push(regexResult);
    } else {
      throw new Error(`internal error: unimplemented operator ${term.value}`);
    }
  }

  if (stack.length !== 1) {
    console.error(
      'error: stack must end with exactly 1 value, ' +
      `but ended with ${stack.length}`
    );
    process.exit(1);
  }
  return stack[0];
}
