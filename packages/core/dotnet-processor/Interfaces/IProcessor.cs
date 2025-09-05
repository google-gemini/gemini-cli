using GeminiProcessor.Models;

namespace GeminiProcessor.Interfaces;

/// <summary>
/// Interface for module processors
/// </summary>
public interface IProcessor
{
    /// <summary>
    /// Process the request and return a response
    /// </summary>
    Task<ProcessResponse> ProcessAsync(ProcessRequest request);
}