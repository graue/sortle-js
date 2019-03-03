import React from 'react';

import {parseSortleProgram, SortleSyntaxError} from '../../lib/parse';
import {stepThroughProgram, SortleRuntimeError} from '../../lib/runtime';

function prettyPrintSyntaxError(error, code) {
  let errorLine = code.split('\n')[error.row];
  let whitespace = '';
  for (let i = 0; i < error.col; i++) {
    whitespace += ' ';
  }

  let msg = `${errorLine}
${whitespace}^

${error.row + 1}:${error.col + 1}: error
  expected: ${error.expected}
`;
  if (error.received) {
    msg += `  received: ${error.received}\n`;
  }
  return msg;
}

export default class SortlePage extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      code: '',
      running: false,
      runningCode: '',
      runState: [],
      runIP: 0,
      runResult: null,
      runError: null,
    };
  }

  requestIdle(callback) {
    if (this._idleCallbackId) {
      cancelIdleCallback(this._idleCallbackId);
    }
    this._idleCallbackId = requestIdleCallback(() => {
      this._idleCallbackId = null;
      callback();
    });
  }

  executeCode = (maxSteps = Infinity) => {
    let {running, runState, runIP} = this.state;
    if (!running) {
      return;
    }
    runState = [...runState];

    if (runState.length === 0) {
      this.setState({
        running: false,
        runError: 'a program must have at least one expression',
      });
      return;
    }

    // When we've been "thinking" for longer than a frame, yield
    const yieldAfter = Date.now() + (1000 / 60);

    let evaluations = 0;

    do {
      if (runState.length === 1) {
        // Program has terminated
        this.setState({
          running: false,
          runResult: runState[0][0],
        });
        return;
      }

      try {
        runIP = stepThroughProgram(runState, runIP);
        evaluations++;
      } catch (err) {
        let runError;
        if (err.name = 'SortleRuntimeError') {
          runError = err.message;
        } else {
          runError = `unknown error: ${String(err)}`;
        }
        this.setState({
          running: false,
          runError,
        });
        return;
      }
    } while (Date.now() < yieldAfter && evaluations < maxSteps);

    console.log(`${evaluations} evaluations before yielding`);
    this.setState(
      {
        runState,
        runIP,
        running: evaluations < maxSteps,
      },
      () => {
        if (evaluations < maxSteps) {
          this.requestIdle(() => this.executeCode(maxSteps - evaluations));
        }
      },
    );
  }

  handleCodeChange = (e) => {
    this.setState({code: e.target.value});
  };

  handleRunClick = (e) => {
    e.preventDefault();
    this.parseAndExecuteCode(Infinity);
  };

  handlePauseClick = (e) => {
    e.preventDefault();
    if (this._idleCallbackId) {
      cancelIdleCallback(this._idleCallbackId);
    }
    this.setState({running: false});
  };

  handleStepClick = (e) => {
    e.preventDefault();
    this.parseAndExecuteCode(1);
  };

  parseAndExecuteCode(maxSteps) {
    if (
      this.state.runningCode
      && this.state.runningCode === this.state.code
      && !this.state.runResult
      && !this.state.runError
      && !this.state.running
    ) {
      // We have a paused execution; resume it.
      this.setState(
        {running: true},
        () => this.executeCode(maxSteps),
      );
      return;
    }
    let parsed;
    try {
      parsed = parseSortleProgram(this.state.code);
    } catch (err) {
      let runError;
      if (err.name = 'SortleSyntaxError') {
        runError = prettyPrintSyntaxError(err, this.state.code);
      } else {
        runError = `unknown error: ${String(err)}`;
      }
      this.setState({
        running: false,
        runningCode: this.state.code,
        runResult: null,
        runError,
      });
      return;
    }
    // Hack: to keep a stable unique identifier for each expression as the
    // program runs, store the original name on the terms (which the runtime
    // will pass through).
    parsed = parsed.map(([name, terms]) => {
      const modifiedTerms = [...terms];
      modifiedTerms._origName = name;
      return [name, modifiedTerms];
    });
    this.setState({
      running: true,
      runningCode: this.state.code,
      runState: [...parsed],
      runIP: 0,
      runResult: null,
      runError: null,
    });
    this.requestIdle(() => this.executeCode(maxSteps));
  }

  renderTerm(term, index) {
    let otherClass = '';
    let printedTerm = term;
    if (typeof term === 'string') {
      otherClass = 'code-string';
      printedTerm = `"${term}"`;
    } else if (typeof term === 'number') {
      otherClass = 'code-number';
    } else {
      otherClass = 'code-operator';
      printedTerm = term.value;
    }
    return (
      <span
        key={'term' + index}
        className={'code-term ' + otherClass}
      >
        {printedTerm}{' '}
      </span>
    );
  }

  renderState() {
    const {runState, runIP} = this.state;
    return runState.map(([name, terms], index) => {
      let nameClasses = 'code-expression-name';
      if (index === runIP) {
        nameClasses += ' code-expression-is-active';
      }
      return (
        <span key={terms._origName}>
          <span className={nameClasses}>{name}</span>
          {' '}<span className="code-separator">:=</span>{' '}
          {terms.map(this.renderTerm, this)}
          {'\n'}
        </span>
      );
    });
  }

  render() {
    const {
      code,
      running,
      runningCode,
      runResult,
      runError,
    } = this.state;
    const stopped = runResult || runError || !runningCode;
    const paused = runningCode && !runResult && !runError && !running;
    return (
      <div>
        <h1>Sortle</h1>
        <h2>A programming language based on insertion sort.</h2>
        <div className="code-and-output">
          <div className="code-pane">
            <textarea
              className="code"
              disabled={running}
              cols="100"
              rows="25"
              value={code}
              onChange={this.handleCodeChange}
            />
          </div>
          <div className="output-pane">
            {(paused || running) && this.renderState()}
            {runResult && (
              <div className="output-container">
                {runResult}
              </div>
            )}
            {runError && (
              <div className="error-container">
                {runError}
              </div>
            )}
          </div>
        </div>
        <div className="controls">
          <button
            disabled={running}
            onClick={this.handleRunClick}
          >
            Run
          </button>
          <button
            disabled={!running}
            onClick={this.handlePauseClick}
          >
            Pause
          </button>
          <button
            disabled={running}
            onClick={this.handleStepClick}
          >
            Step
          </button>
        </div>
      </div>
    );
  }
}
