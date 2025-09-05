namespace GeminiProcessor.Models;

/// <summary>
/// Response model for processing operations
/// </summary>
public class ProcessResponse
{
    /// <summary>
    /// Whether the operation was successful
    /// </summary>
    public bool Success { get; set; }

    /// <summary>
    /// Error message if operation failed
    /// </summary>
    public string? Error { get; set; }

    /// <summary>
    /// Content for LLM display
    /// </summary>
    public string? LlmContent { get; set; }

    /// <summary>
    /// Content for return display
    /// </summary>
    public string? ReturnDisplay { get; set; }

    /// <summary>
    /// Additional data specific to the operation
    /// </summary>
    public Dictionary<string, object?> Data { get; set; } = new();

    /// <summary>
    /// Creates a successful response
    /// </summary>
    public static ProcessResponse CreateSuccess(string? llmContent = null, string? returnDisplay = null, Dictionary<string, object?>? data = null)
    {
        return new ProcessResponse
        {
            Success = true,
            LlmContent = llmContent,
            ReturnDisplay = returnDisplay,
            Data = data ?? new()
        };
    }

    /// <summary>
    /// Creates a failure response
    /// </summary>
    public static ProcessResponse CreateFailure(string error)
    {
        return new ProcessResponse
        {
            Success = false,
            Error = error,
            LlmContent = $"Operation failed: {error}",
            ReturnDisplay = $"Operation failed: {error}"
        };
    }
}