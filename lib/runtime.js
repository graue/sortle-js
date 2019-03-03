const {evalRegex} = require('./regex');

class SortleRuntimeError extends Error {
  constructor(message) {
    super();
    this.message = message;
  }
}

// A program, or program state, is an array of [expression name, expression]
// tuples. This is initially created by the parser from Sortle code.
//
// An expression is an array of this union:
//  number | string | {
//    type: 'operator',
//    value: '+' | '*' | '/' | '%' | '^' | '~' | '?' | '$',
//  }
function runProgram(expressions) {
  if (expressions.length === 0) {
    throw new SortleRuntimeError('program must have at least one expression');
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

  // Return final expression
  return expressions[0][0];
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
      throw new SortleRuntimeError(
        `cannot execute ${term.value}: ` +
        `need 2 elements on stack, have ${stack.length}`
      );
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
        throw new SortleRuntimeError('substring regex form not implemented');
      }

      // According to an older spec, the order of testing is reverse order,
      // starting prior to instruction pointer.
      const expressionsToMatch =
        expressions.slice(0, ip)
          .reverse()
          .concat(expressions.slice(ip + 1).reverse());

      stack.push(evalRegex(
        sortleString(op2),
        expressionsToMatch.map(([name, terms]) => name),
      ));
    } else {
      throw new SortleRuntimeError(`internal error: unimplemented operator ${term.value}`);
    }
  }

  if (stack.length !== 1) {
    throw new SortleRuntimeError(
      'stack must end with exactly 1 value, ' +
      `but ended with ${stack.length}`
    );
  }
  return stack[0];
}

module.exports.runProgram = runProgram;
module.exports.SortleRuntimeError = SortleRuntimeError;
