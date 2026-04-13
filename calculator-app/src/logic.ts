import { evaluate } from 'mathjs';

export interface CalculatorState {
  display: string;
  equation: string;
  lastResult: string | null;
}

export const initialState: CalculatorState = {
  display: '0',
  equation: '',
  lastResult: null,
};

export function handleInput(state: CalculatorState, input: string): CalculatorState {
  if (/[0-9]/.test(input)) {
    if (state.display === '0' || state.lastResult !== null) {
      return { ...state, display: input, lastResult: null };
    } else {
      return { ...state, display: state.display + input };
    }
  } else if (input === '.') {
    if (!state.display.includes('.')) {
      return { ...state, display: state.display + '.' };
    }
  } else if (['+', '-', '*', '/'].includes(input)) {
    return {
      ...state,
      equation: `${state.display} ${input} `,
      display: '0',
    };
  }
  return state;
}

export function calculate(state: CalculatorState): CalculatorState {
  try {
    const fullEquation = state.equation + state.display;
    const result = evaluate(fullEquation);
    const resultStr = result.toString();
    return {
      display: resultStr,
      equation: '',
      lastResult: resultStr,
    };
  } catch (error) {
    return {
      display: 'Error',
      equation: '',
      lastResult: null,
    };
  }
}

export function deleteLast(state: CalculatorState): CalculatorState {
  if (state.display.length > 1) {
    return { ...state, display: state.display.slice(0, -1) };
  } else {
    return { ...state, display: '0' };
  }
}
