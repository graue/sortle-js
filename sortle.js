#!/usr/bin/env node

const {readFileSync} = require('fs');
const {SortleSyntaxError, parseSortleProgram} = require('./lib/parse');
const {SortleRegexError} = require('./lib/regex');
const {SortleRuntimeError, runProgram} = require('./lib/runtime');

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

  let output;
  try {
    output = runProgram(program);
  } catch (e) {
    if (e instanceof SortleRegexError) {
      console.error(`error: ${e.message}`);
      console.error(`when evaluating regex: ${e.regex}`);
      process.exit(1);
    } else if (e instanceof SortleRuntimeError) {
      console.error(`error: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(output);
}
