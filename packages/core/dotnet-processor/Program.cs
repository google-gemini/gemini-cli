using System.Text.Json;
using GeminiProcessor.Factories;
using GeminiProcessor.Models;

namespace GeminiProcessor;

public class Program
{
    public static async Task<int> Main(string[] args)
    {
        try
        {
            // Validate arguments
            if (args.Length != 1)
            {
                Console.Error.WriteLine("Usage: GeminiProcessor.exe <request-file-path>");
                return 1;
            }

            string requestFilePath = args[0];

            // Check if request file exists
            if (!File.Exists(requestFilePath))
            {
                Console.Error.WriteLine($"Request file not found: {requestFilePath}");
                return 2;
            }

            // Read and parse request
            string requestJson = await File.ReadAllTextAsync(requestFilePath);
            var options = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                PropertyNameCaseInsensitive = true
            };
            var request = JsonSerializer.Deserialize<ProcessRequest>(requestJson, options);

            if (request == null)
            {
                Console.Error.WriteLine("Failed to parse request JSON");
                return 3;
            }

            // Validate request
            if (string.IsNullOrEmpty(request.Module))
            {
                Console.Error.WriteLine("Module name is required");
                return 4;
            }

            if (string.IsNullOrEmpty(request.Operation))
            {
                Console.Error.WriteLine("Operation name is required");
                return 5;
            }

            if (string.IsNullOrEmpty(request.ResponseFile))
            {
                Console.Error.WriteLine("Response file path is required");
                return 6;
            }

            ProcessResponse response;

            try
            {
                // Create processor and process request
                var processor = ProcessorFactory.Create(request.Module);
                response = await processor.ProcessAsync(request);
            }
            catch (ArgumentException ex)
            {
                response = ProcessResponse.CreateFailure($"Unsupported module '{request.Module}': {ex.Message}");
            }
            catch (Exception ex)
            {
                response = ProcessResponse.CreateFailure($"Processing error: {ex.Message}");
            }

            // Write response
            var responseJson = JsonSerializer.Serialize(response, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                WriteIndented = true
            });

            await File.WriteAllTextAsync(request.ResponseFile, responseJson);

            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Unexpected error: {ex.Message}");
            return 99;
        }
    }
}