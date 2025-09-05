using System.Text.Json;

namespace GeminiProcessor.Models;

/// <summary>
/// Request model for processing operations
/// </summary>
public class ProcessRequest
{
    /// <summary>
    /// Module name (e.g., "excel", "pdf", "image")
    /// </summary>
    public string Module { get; set; } = string.Empty;

    /// <summary>
    /// Operation name (e.g., "read", "write", "create")
    /// </summary>
    public string Operation { get; set; } = string.Empty;

    /// <summary>
    /// Operation parameters as JSON
    /// </summary>
    public JsonElement Parameters { get; set; }

    /// <summary>
    /// Unique request identifier
    /// </summary>
    public string RequestId { get; set; } = string.Empty;

    /// <summary>
    /// Path to write response file
    /// </summary>
    public string ResponseFile { get; set; } = string.Empty;
}