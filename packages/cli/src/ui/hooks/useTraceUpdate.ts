import { useEffect, useRef } from 'react';
import { debugLogger } from '@google/gemini-cli-core';

/**
 * Custom hook to trace which props/state triggered a re-render.
 * 
 * @param componentName - Name of the component for logging
 * @param props - Object containing props or state to track
 */
export function useTraceUpdate(componentName: string, props: any) {
  const prev = useRef(props);
  useEffect(() => {
    const changedProps = Object.entries(props).reduce((ps: any, [k, v]) => {
      if (prev.current[k] !== v) {
        ps[k] = { from: prev.current[k], to: v };
      }
      return ps;
    }, {});

    if (Object.keys(changedProps).length > 0) {
      debugLogger.debug(`[${componentName}] Render triggered by:`, changedProps);
    } else {
      // In infinite render loop cases, this might help identify renders with NO prop changes (e.g. internal state)
      debugLogger.debug(`[${componentName}] Render with NO tracked prop/state changes.`);
    }
    prev.current = props;
  });
}
