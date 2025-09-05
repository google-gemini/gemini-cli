using GeminiProcessor.Interfaces;
using GeminiProcessor.Processors;

namespace GeminiProcessor.Factories;

/// <summary>
/// Factory for creating processor instances
/// </summary>
public static class ProcessorFactory
{
    /// <summary>
    /// Creates a processor for the specified module
    /// </summary>
    public static IProcessor Create(string module)
    {
        return module.ToLower() switch
        {
            "excel" => new ExcelProcessor(),
            _ => throw new ArgumentException($"Unknown module: {module}")
        };
    }

    /// <summary>
    /// Gets all supported modules
    /// </summary>
    public static string[] GetSupportedModules()
    {
        return new[] { "excel" };
    }
}