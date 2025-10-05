import React from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { AlertTriangle, Code, Info, Server, FileText } from 'lucide-react';
import { CodeHighlight } from '@/components/ui/CodeHighlight';

// Import types from local types to avoid WASM dependencies
import type {
  ToolCallConfirmationDetails,
  ToolEditConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolMcpConfirmationDetails,
  ToolInfoConfirmationDetails,
} from '@/types';
import { ToolConfirmationOutcome } from '@/types';

interface ToolConfirmationMessageProps {
  confirmationDetails: ToolCallConfirmationDetails;
  onConfirm: (outcome: ToolConfirmationOutcome) => void;
}

const ToolConfirmationMessage: React.FC<ToolConfirmationMessageProps> = ({
  confirmationDetails,
  onConfirm,
}) => {
  const handleConfirm = (outcome: ToolConfirmationOutcome) => {
    onConfirm(outcome);
  };

  const renderEditConfirmation = (details: ToolEditConfirmationDetails) => (
    <div className="flex gap-3">
      {/* Assistant Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
        <AlertTriangle className="h-4 w-4 text-orange-600" />
      </div>
      
      {/* Message Content */}
      <div className="flex-1 min-w-0">
        <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/10 dark:border-orange-800/50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-orange-800 dark:text-orange-200">
              <Code className="h-4 w-4" />
              Tool wants to edit file
            </div>
            
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4" />
              <span className="font-mono text-sm">{details.fileName}</span>
            </div>
            
            <div className="bg-white dark:bg-gray-900 rounded-md border border-orange-200/50 dark:border-orange-800/50">
              <div className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 border-b border-orange-200/50 dark:border-orange-800/50">
                Changes Preview:
              </div>
              <div className="h-32 overflow-auto p-3">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {details.fileDiff}
                </pre>
              </div>
            </div>

            <div className="text-sm font-medium text-orange-800 dark:text-orange-200">
              Do you want to apply this change?
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => handleConfirm(ToolConfirmationOutcome.ProceedOnce)}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Allow once
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleConfirm(ToolConfirmationOutcome.ProceedAlways)}
                className="border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950"
              >
                Always allow
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleConfirm(ToolConfirmationOutcome.ModifyWithEditor)}
              >
                Modify with editor
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleConfirm(ToolConfirmationOutcome.Cancel)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const renderExecConfirmation = (details: ToolExecuteConfirmationDetails) => {
    // Extract Python code from command (remove "python toolname..." prefix)
    const extractPythonCode = (command: string): string => {
      console.log('Original command:', command);
      console.log('Command length:', command.length);

      // Command format: "python toolname (requires: ...)\n\n<actual python code>"
      // We need to extract just the Python code part
      const parts = command.split('\n\n');
      console.log('Split parts:', parts.length);

      if (parts.length > 1) {
        // Return everything after the first "\n\n"
        const extracted = parts.slice(1).join('\n\n');
        console.log('Extracted code:', extracted);
        console.log('Extracted length:', extracted.length);
        return extracted;
      }
      return command;
    };

    // Parse tool information from command and rootCommand
    const parseToolInfo = () => {
      const { command, rootCommand } = details;

      // Extract tool name from rootCommand (format: toolname_python)
      const toolName = rootCommand.replace(/_python$/, '');

      // Extract operation from Python code if possible
      let operation = 'execute';
      let parameters: string[] = [];

      // Look for operation patterns in the command (using 'op=' parameter)
      const opMatch = command.match(/op\s*=\s*["']([^"']+)["']/);
      if (opMatch) {
        operation = opMatch[1];
      }

      // Extract requirements if present
      const reqMatch = command.match(/\(requires:\s*([^)]+)\)/);
      const requirements = reqMatch ? reqMatch[1].split(', ') : [];

      // Extract key parameters from the code
      const paramMatches = command.match(/(\w+)\s*=\s*["']([^"']+)["']/g);
      if (paramMatches) {
        parameters = paramMatches
          .filter(p => !p.includes('op ='))
          .map(p => {
            const [key, value] = p.split('=');
            return `${key.trim()}: ${value.replace(/["']/g, '').trim()}`;
          })
          .slice(0, 3); // Limit to first 3 parameters
      }

      return { toolName, operation, requirements, parameters };
    };

    const { toolName, operation, requirements, parameters } = parseToolInfo();

    return (
      <div className="flex gap-3">
        {/* Assistant Avatar */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
          <AlertTriangle className="h-4 w-4 text-red-600" />
        </div>

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/10 dark:border-red-800/50">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-200">
                <Server className="h-4 w-4" />
                Tool wants to execute Python code
              </div>

              {/* Tool Information */}
              <div className="bg-white dark:bg-gray-900 rounded-md border border-red-200/50 dark:border-red-800/50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tool:</span>
                  <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded border border-blue-300 dark:border-blue-600 font-mono">
                    {toolName}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Operation:</span>
                  <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded border border-green-300 dark:border-green-600 font-mono">
                    {operation}
                  </span>
                </div>

                {parameters.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">Parameters:</span>
                    <div className="flex flex-wrap gap-1">
                      {parameters.map((param, idx) => (
                        <span key={idx} className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded border border-gray-300 dark:border-gray-600 font-mono">
                          {param}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {requirements.length > 0 && (
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">Requires:</span>
                    <div className="flex flex-wrap gap-1">
                      {requirements.map((req, idx) => (
                        <span key={idx} className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded border border-purple-300 dark:border-purple-600 font-mono">
                          {req.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Code Section */}
              <details open className="rounded-md border border-red-200/50 dark:border-red-800/50 overflow-hidden">
                <summary className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  🐍 Python Code (Click to collapse)
                </summary>
                <div>
                  <CodeHighlight code={extractPythonCode(details.command)} language="python" maxHeight="400px" />
                </div>
              </details>

              <div className="text-sm font-medium text-red-800 dark:text-red-200">
                Do you want to allow execution of "{toolName}" tool with operation "{operation}"?
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => handleConfirm(ToolConfirmationOutcome.ProceedOnce)}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Allow once
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleConfirm(ToolConfirmationOutcome.ProceedAlways)}
                  className="border-green-600 text-green-700 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-950"
                >
                  Always allow
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleConfirm(ToolConfirmationOutcome.Cancel)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderMcpConfirmation = (details: ToolMcpConfirmationDetails) => (
    <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Server className="h-4 w-4 text-purple-600" />
          MCP Tool Confirmation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Server:</span>
          <span className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded border border-purple-300 dark:border-purple-600">
            {details.serverName}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Tool:</span>
          <span className="px-2 py-1 text-xs bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-200 rounded">
            {details.toolName}
          </span>
        </div>

        <div className="text-sm font-medium">
          Allow execution of MCP tool "{details.toolName}" from server "{details.serverName}"?
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => handleConfirm(ToolConfirmationOutcome.ProceedOnce)}
            className="bg-green-600 hover:bg-green-700"
          >
            Yes, allow once
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleConfirm(ToolConfirmationOutcome.ProceedAlwaysTool)}
          >
            Always allow tool "{details.toolName}"
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleConfirm(ToolConfirmationOutcome.ProceedAlwaysServer)}
          >
            Always allow server "{details.serverName}"
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleConfirm(ToolConfirmationOutcome.Cancel)}
          >
            No, suggest changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderInfoConfirmation = (details: ToolInfoConfirmationDetails) => (
    <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-600" />
          Information Request Confirmation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-white dark:bg-gray-900 rounded-md border p-3">
          <div className="text-sm text-blue-800 dark:text-blue-200">
            {details.prompt}
          </div>
        </div>
        
        {details.urls && details.urls.length > 0 && (
          <div>
            <div className="text-sm font-medium mb-2">URLs to fetch:</div>
            <div className="h-20 overflow-auto bg-white dark:bg-gray-900 rounded-md border p-3">
              <ul className="text-xs space-y-1">
                {details.urls.map((url, index) => (
                  <li key={index} className="text-blue-600 dark:text-blue-400">
                    • {url}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="text-sm font-medium">Do you want to proceed?</div>
        
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => handleConfirm(ToolConfirmationOutcome.ProceedOnce)}
            className="bg-green-600 hover:bg-green-700"
          >
            Yes, allow once
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleConfirm(ToolConfirmationOutcome.ProceedAlways)}
          >
            Yes, allow always
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleConfirm(ToolConfirmationOutcome.Cancel)}
          >
            No, suggest changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Render appropriate confirmation based on type
  switch (confirmationDetails.type) {
    case 'edit':
      return renderEditConfirmation(confirmationDetails as ToolEditConfirmationDetails);
    case 'exec':
      return renderExecConfirmation(confirmationDetails as ToolExecuteConfirmationDetails);
    case 'mcp':
      return renderMcpConfirmation(confirmationDetails as ToolMcpConfirmationDetails);
    case 'info':
      return renderInfoConfirmation(confirmationDetails as ToolInfoConfirmationDetails);
    default:
      return (
        <Card className="border-gray-200 bg-gray-50 dark:bg-gray-950/20 dark:border-gray-800">
          <CardContent className="p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Unknown confirmation type: {(confirmationDetails as any).type}
            </div>
          </CardContent>
        </Card>
      );
  }
};

export default ToolConfirmationMessage;