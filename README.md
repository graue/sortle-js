# Sortle

## A programming language based on insertion sort

![A Sortle example program (Fibonacci number calculator) being debugged.](https://raw.githubusercontent.com/graue/sortle-js/master/doc/screenshot.png)

[Sortle](https://esolangs.org/wiki/Sortle) is an esoteric programming language
based on string rewriting, insertion sort and regexes. This repo contains a
command-line interpreter written in JavaScript and runnable via Node, as well
as a browser-based interpreter and debugger that allows stepping through
programs one expression at a time.

## Description of Sortle

Programs consist of lists of named expressions, which are sorted and evaluated
from top to bottom. Expressions have no side effects; the result of an
expression becomes the new name of the expression, and the list's order is
adjusted accordingly.

An expression that renames itself to `""` (the null string) is deleted. An
expression that renames itself to the name of another expression _clobbers_
(replaces) that expression. When only one expression remains, its name is
printed out to the user and the program halts. This is both the only way to end
the program and the only form of output.

An expression can use regex to match (and extract parts of) other expressions'
names. This is the only way of storing data in Sortle.

- [More on Esolang wiki](https://esolangs.org/wiki/Sortle)
- [Language spec](https://github.com/graue/esofiles/blob/master/sortle/doc/sortle.pdf)
- [Example programs](https://github.com/graue/esofiles/tree/master/sortle/src/)

## Implementation notes

### Deviations from spec

- Does not implement the form of regex that matches substrings of the expression's own name.
- Integer arithmetic is not modulo `2**32`.
- Strings work like JavaScript strings, instead of being a series of bytes.

### Clarifications to spec

- Regexes match in reverse sort order, starting with the expression previous to the expression being evaluated.
- If a regex doesn't match, the result is the null string.
- Multiple capturing groups in a regex, like `(a.)(c.)`, are treated as an error.
- If a non-numeric string has to be converted to a number, any leading digits are interpreted as a number and the rest of the string thrown away. If there are no leading digits, the string converts to 0.

