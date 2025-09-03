import React from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { AlertTriangle, Code, Info, Server, FileText } from 'lucide-react';

// Import types from core package
import type {
  ToolCallConfirmationDetails,
  ToolEditConfirmationDetails,
  ToolExecuteConfirmationDetails,
  ToolMcpConfirmationDetails,
  ToolInfoConfirmationDetails,
} from '@google/gemini-cli-core';
import { ToolConfirmationOutcome } from '@google/gemini-cli-core';

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
    <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Code className="h-4 w-4 text-orange-600" />
          File Edit Confirmation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4" />
          <span className="font-medium">{details.fileName}</span>
        </div>
        
        <div className="bg-white dark:bg-gray-900 rounded-md border">
          <div className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 border-b">
            Changes Preview:
          </div>
          <div className="h-32 overflow-auto p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {details.fileDiff}
            </pre>
          </div>
        </div>

        <div className="text-sm font-medium">Apply this change?</div>
        
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
            No, suggest changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderExecConfirmation = (details: ToolExecuteConfirmationDetails) => (
    <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          Command Execution Confirmation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-white dark:bg-gray-900 rounded-md border">
          <div className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 border-b">
            Command to execute:
          </div>
          <div className="p-3">
            <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
              {details.command}
            </code>
          </div>
        </div>

        <div className="text-sm font-medium">
          Allow execution of: '{details.rootCommand}'?
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