class SortleRegexError extends Error {
  constructor(regex, message) {
    super();
    this.regex = regex;
    this.message = message;
  }
}

function evalRegex(regex, stringsToMatch) {
  const compiledRegex = compileRegex(regex);
  for (const str of stringsToMatch) {
    const result = matchCompiledRegex(compiledRegex, str);
    if (result != null) {
      return result;
    }
  }
  // Behavior in case of no match is not specified. Returning empty
  // string is what the Perl implementation does.
  return '';
}

// Return a compiled regex; array of elements described like:
// {
//   chars: string,
//   optional: boolean, // corresponds to @
//   canRepeat: boolean, // corresponds to !
//   capturing: boolean,
// }
function compileRegex(regex) {
  const compiled = [];

  let currentElementChars = '';
  let inGroup = null;
  let capturingGroupSeen = false;

  const finishElement = () => {
    compiled.push({
      chars: currentElementChars,
      capturing: inGroup === '(',
      _grouped: !!inGroup, // compiler internal use only
    });
    currentElementChars = '';
    inGroup = null;
  };

  const modifyLastElement = (modifier) => {
    if (compiled.length === 0) {
      // This means the regex began with a ! or @. Should probably either be
      // an error or interpreted literally, but ignore for now.
      return;
    }
    const lastElement = compiled[compiled.length - 1];
    if (modifier === '!') {
      lastElement.canRepeat = true;
      lastElement.optional = false;
    } else if (modifier === '@') {
      lastElement.canRepeat = false;
      lastElement.optional = true;
    }
    if (!lastElement._grouped && lastElement.chars.length > 1) {
      // We need to split the last element into two, because we have something
      // like 'abc!' and only the 'c' is allowed to repeat, not the 'abc'.
      const head = lastElement.chars.substr(0, lastElement.chars.length - 1);
      lastElement.chars = lastElement.chars.substr(-1);
      compiled.splice(
        compiled.length - 1,
        0,
        {chars: head, capturing: false, _grouped: false},
      );
    }
  };

  for (let i = 0; i < regex.length; i++) {
    const chr = regex[i];
    if (chr === '[' || chr === '(') {
      if (inGroup) {
        throw new SortleRegexError(
          regex,
          `cannot nest groups - unexpected ${chr} inside group of ${inGroup}`,
        );
      } else if (currentElementChars.length > 0) {
        finishElement();
      }
      inGroup = chr;
      if (chr === '(') {
        if (capturingGroupSeen) {
          // Technically, this is unspecified behavior. Inferring that spec
          // didn't intend to allow it.
          throw new SortleRegexError(regex, 'cannot use multiple () groups');
        }
        capturingGroupSeen = true;
      }
    } else if ((inGroup === '[' && chr === ']') || (inGroup === '(' && chr === ')')) {
      finishElement();
    } else if (chr === '@' || chr === '!') {
      if (!inGroup && currentElementChars.length > 0) {
        finishElement();
      }
      modifyLastElement(chr);
    } else {
      currentElementChars += chr;
    }
  }
  if (inGroup) {
    throw new SortleRegexError(regex, `unclosed ${inGroup}`);
  }
  if (currentElementChars.length > 0) {
    finishElement();
  }
  return compiled;
}

// If the regex matches, returns whatever's in the capturing group, or if no
// capturing group, str. If the regex does not match, returns undefined.
function matchCompiledRegex(regex, str) {
  const recursiveMatchResult = matchCompiledRegexRecursive(regex, str);
  if (recursiveMatchResult) {
    return recursiveMatchResult.match;
  }
  return undefined;
}

// If the regex matches, returns {capturingGroup: boolean, match: string}.
// Else returns undefined.
function matchCompiledRegexRecursive(regex, str) {
  let strPos = 0;
  let capturedSubstring;
  for (let [elIdx, el] of regex.entries()) {
    const {chars, optional, canRepeat, capturing} = el;
    let elementMatch;

    if (!optional && !canRepeat) {
      // Consume iteratively
      if (!consumeElement(str, strPos, chars, 1)) {
        return false;
      }
      if (capturing) {
        capturedSubstring = str.substr(strPos, chars.length);
      }
      strPos += chars.length;
      continue;
    }

    const minRepeat = optional ? 0 : 1;
    const maxRepeat = canRepeat ? Infinity : 1;

    // The control flow is a bit odd here. Because regex in Sortle is lazy,
    // we gotta try the minimum number of repetitions first, and then
    // backtrack if that doesn't work and add one more repetition, and so
    // on. We do this recursively. So as soon as we encounter a ! or @
    // group, we decide on whether the entire string matches right here.
    for (let reps = minRepeat; reps < maxRepeat; reps++) {
      if (reps > 0 && !consumeElement(str, strPos, chars, reps)) {
        // If we didn't match N times, we're not going to match N+1 times
        break;
      }
      // This element matches; check if the tail (regex after this element)
      // matches the string after what this element consumed.
      const restOfRegex = regex.slice(elIdx + 1);
      const restOfStr = str.substr(strPos + (chars.length * reps));
      const tailMatch = matchCompiledRegexRecursive(restOfRegex, restOfStr);
      if (tailMatch) {
        // Successfully matched entire string!
        if (tailMatch.capturingGroup) {
          return tailMatch; // Propagate the capture
        }
        else if (capturing) {
          return {
            capturingGroup: true,
            match: str.substr(strPos, chars.length * reps),
          };
        } else {
          return {
            capturingGroup: capturedSubstring != null,
            match: capturedSubstring != null ? capturedSubstring : str,
          };
        }
      }
    }
    return undefined;
  }
  // Exhausted all regex elements. So we matched if and only if we also
  // exhausted the string.
  if (strPos === str.length) {
    return {
      capturingGroup: capturedSubstring != null,
      match: capturedSubstring != null ? capturedSubstring : str,
    };
  }
  return undefined;
}

// Attempt to consume `repetitions` repetitions of `chars`, which is a mix of
// `.`s standing in for any character, and other characters treated literally.
// If successful, return true (chars.length * repetitions characters consumed).
function consumeElement(str, strStartPos, chars, repetitions) {
  const isAllDots = chars.match(/^\.*$/);
  const charsToConsume = chars.length * repetitions;
  if (charsToConsume > str.length - strStartPos) {
    return false;
  }
  if (isAllDots) {
    // Optimization: if the element is all dots, as long as the string is long
    // enough, it matches.
    return true;
  }
  for (let rep = 0; rep < repetitions; rep++) {
    for (let i = 0; i < chars.length; i++) {
      const chr = chars[i];
      if (chr === '.') {
        continue;
      }
      if (chr !== str[strStartPos + (rep * chars.length) + i]) {
        return false;
      }
    }
  }
  return true;
}

module.exports.evalRegex = evalRegex;
module.exports.SortleRegexError = SortleRegexError;
