return {
        llmContent: `[SHELL_OUTPUT]
${llmContent}`,
        returnDisplay: returnDisplayMessage,
        ...executionError,
        toolSpecificInfo: { isShellOutput: true },
      };
    } finally {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      signal.removeEventListener('abort', onAbort);
      timeoutController.signal.removeEventListener('abort', onAbort);
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }