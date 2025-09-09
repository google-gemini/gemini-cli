using System.Text.Json;
using ClosedXML.Excel;
using GeminiProcessor.Interfaces;
using GeminiProcessor.Models;

namespace GeminiProcessor.Processors;

/// <summary>
/// Processor for Excel operations using ClosedXML
/// </summary>
public class ExcelProcessor : IProcessor
{
    public async Task<ProcessResponse> ProcessAsync(ProcessRequest request)
    {
        try
        {
            return request.Operation.ToLower() switch
            {
                "read" => await ReadExcel(request.Parameters),
                "readcontent" => await ReadExcelContent(request.Parameters),
                "write" => await WriteExcel(request.Parameters),
                "create" => await CreateExcel(request.Parameters),
                "listsheets" => await ListSheets(request.Parameters),
                "copysheet" => await CopySheet(request.Parameters),
                "addsheet" => await AddSheet(request.Parameters),
                "editsheet" => await EditSheet(request.Parameters),
                "deletesheet" => await DeleteSheet(request.Parameters),
                "csvread" => await ReadCSV(request.Parameters),
                "csvexport" => await ExportToCSV(request.Parameters),
                "csvimport" => await ImportFromCSV(request.Parameters),
                "comment" => await AddComment(request.Parameters),
                "merge" => await MergeCells(request.Parameters),
                "rows" => await ManageRows(request.Parameters),
                "cols" => await ManageCols(request.Parameters),
                "style" => await StyleRange(request.Parameters),
                "validate" => await AddValidation(request.Parameters),
                _ => ProcessResponse.CreateFailure($"Unsupported operation: {request.Operation}")
            };
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Excel processing error: {ex.Message}");
        }
    }

    private async Task<ProcessResponse> ReadExcel(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;
        var range = parameters.TryGetProperty("range", out var rangeElement) ? rangeElement.GetString() : null;

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"File not found: {file}");

        try
        {
            using var workbook = new XLWorkbook(file);
            
            if (workbook.Worksheets.Count == 0)
            {
                return ProcessResponse.CreateSuccess(
                    "Excel file contains no worksheets",
                    "No worksheets found",
                    new Dictionary<string, object?> 
                    { 
                        ["data"] = new object[0][],
                        ["rowCount"] = 0,
                        ["colCount"] = 0,
                        ["sheets"] = new string[0]
                    }
                );
            }

            // If specific sheet requested
            if (!string.IsNullOrEmpty(sheet))
            {
                var worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet);
                if (worksheet == null)
                {
                    var availableSheets = workbook.Worksheets.Select(w => w.Name).ToArray();
                    return ProcessResponse.CreateFailure($"Sheet '{sheet}' not found. Available sheets: {string.Join(", ", availableSheets)}");
                }

                var result = ReadWorksheetData(worksheet, range);
                var usedRange = GetUsedRange(worksheet);
                
                return ProcessResponse.CreateSuccess(
                    $"excel(read): Read {result.RowCount} rows from {worksheet.Name}\nData preview:\n{FormatDataPreview(result.Data)}",
                    $"excel(read): Read {result.RowCount} rows from {worksheet.Name}",
                    new Dictionary<string, object?>
                    {
                        ["data"] = result.Data,
                        ["rowCount"] = result.RowCount,
                        ["colCount"] = result.ColCount,
                        ["sheet"] = worksheet.Name,
                        ["usedRange"] = usedRange,
                        ["formulas"] = result.Formulas
                    }
                );
            }

            // Read from first 3 sheets
            var allData = new List<object[]>();
            var allFormulas = new List<object>();
            var sheetSummaries = new List<string>();
            var worksheetsToRead = workbook.Worksheets.Take(3);

            foreach (var worksheet in worksheetsToRead)
            {
                var result = ReadWorksheetData(worksheet, range);
                allData.AddRange(result.Data);
                
                foreach (var formula in result.Formulas)
                {
                    allFormulas.Add(new { 
                        cell = formula.Cell, 
                        formula = formula.Formula, 
                        value = formula.Value,
                        sheet = worksheet.Name 
                    });
                }
                
                sheetSummaries.Add($"{worksheet.Name}: {result.RowCount} rows");
            }

            var summary = $"excel(read): Read from {worksheetsToRead.Count()} sheets: {string.Join(", ", sheetSummaries)}";
            
            return ProcessResponse.CreateSuccess(
                summary,
                summary,
                new Dictionary<string, object?>
                {
                    ["data"] = allData.ToArray(),
                    ["rowCount"] = allData.Count,
                    ["colCount"] = allData.FirstOrDefault()?.Length ?? 0,
                    ["sheets"] = worksheetsToRead.Select(w => w.Name).ToArray(),
                    ["formulas"] = allFormulas.ToArray()
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to read Excel file: {ex.Message}");
        }
    }

    private async Task<ProcessResponse> WriteExcel(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;
        var range = parameters.TryGetProperty("range", out var rangeElement) ? rangeElement.GetString() : null;
        
        if (!parameters.TryGetProperty("data", out var dataElement))
            return ProcessResponse.CreateFailure("Data parameter is required");

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        try
        {
            // Parse data array
            var data = new List<object[]>();
            foreach (var row in dataElement.EnumerateArray())
            {
                var rowData = new List<object>();
                foreach (var cell in row.EnumerateArray())
                {
                    rowData.Add(cell.GetString() ?? "");
                }
                data.Add(rowData.ToArray());
            }

            if (data.Count == 0)
                return ProcessResponse.CreateFailure("No data provided");

            XLWorkbook workbook;
            if (File.Exists(file))
            {
                workbook = new XLWorkbook(file);
            }
            else
            {
                workbook = new XLWorkbook();
            }

            using (workbook)
            {
                IXLWorksheet worksheet;
                if (!string.IsNullOrEmpty(sheet))
                {
                    worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet) 
                               ?? workbook.Worksheets.Add(sheet);
                }
                else
                {
                    worksheet = workbook.Worksheets.FirstOrDefault() 
                               ?? workbook.Worksheets.Add("Sheet1");
                }

                // Determine start position
                int startRow = 1, startCol = 1;
                if (!string.IsNullOrEmpty(range))
                {
                    var cell = worksheet.Cell(range);
                    startRow = cell.Address.RowNumber;
                    startCol = cell.Address.ColumnNumber;
                }

                // Write data
                for (int r = 0; r < data.Count; r++)
                {
                    for (int c = 0; c < data[r].Length; c++)
                    {
                        var cellValue = data[r][c]?.ToString() ?? "";
                        var cell = worksheet.Cell(startRow + r, startCol + c);
                        
                        // Handle formulas (strings starting with =)
                        if (cellValue.StartsWith("="))
                        {
                            cell.FormulaA1 = cellValue.Substring(1);
                        }
                        else
                        {
                            cell.Value = cellValue;
                        }
                    }
                }

                workbook.SaveAs(file);

                return ProcessResponse.CreateSuccess(
                    $"excel(write): Wrote {data.Count} rows to {worksheet.Name}",
                    $"excel(write): Wrote {data.Count} rows to {worksheet.Name}",
                    new Dictionary<string, object?>
                    {
                        ["file"] = file,
                        ["sheet"] = worksheet.Name,
                        ["rowCount"] = data.Count,
                        ["colCount"] = data.FirstOrDefault()?.Length ?? 0
                    }
                );
            }
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to write Excel file: {ex.Message}");
        }
    }

    private async Task<ProcessResponse> CreateExcel(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : "Sheet1";

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        try
        {
            using var workbook = new XLWorkbook();
            var worksheet = workbook.Worksheets.Add(sheet);

            // Add data if provided
            if (parameters.TryGetProperty("data", out var dataElement))
            {
                var data = new List<object[]>();
                foreach (var row in dataElement.EnumerateArray())
                {
                    var rowData = new List<object>();
                    foreach (var cell in row.EnumerateArray())
                    {
                        rowData.Add(cell.GetString() ?? "");
                    }
                    data.Add(rowData.ToArray());
                }

                for (int r = 0; r < data.Count; r++)
                {
                    for (int c = 0; c < data[r].Length; c++)
                    {
                        worksheet.Cell(r + 1, c + 1).Value = data[r][c]?.ToString() ?? "";
                    }
                }
            }

            workbook.SaveAs(file);

            return ProcessResponse.CreateSuccess(
                $"Created {file} with sheet: {sheet}",
                $"Created {file} with sheet: {sheet}",
                new Dictionary<string, object?>
                {
                    ["file"] = file,
                    ["sheet"] = sheet,
                    ["sheets"] = new[] { sheet }
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to create Excel file: {ex.Message}");
        }
    }

    private async Task<ProcessResponse> ListSheets(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"File not found: {file}");

        try
        {
            using var workbook = new XLWorkbook(file);
            
            if (workbook.Worksheets.Count == 0)
            {
                return ProcessResponse.CreateSuccess(
                    "Excel file contains no worksheets",
                    "No worksheets found",
                    new Dictionary<string, object?> { ["sheets"] = new string[0] }
                );
            }

            var sheetsInfo = new List<string>();
            var sheetNames = new List<string>();

            foreach (var worksheet in workbook.Worksheets)
            {
                var usedRange = GetUsedRange(worksheet);
                var rowCount = worksheet.RangeUsed()?.RowCount() ?? 0;
                var colCount = worksheet.RangeUsed()?.ColumnCount() ?? 0;

                sheetNames.Add(worksheet.Name);
                sheetsInfo.Add($"{worksheet.Name} ({usedRange}, {rowCount} rows × {colCount} cols)");
            }

            var summary = $"excel(listSheets): Found {sheetNames.Count} sheets: {string.Join(", ", sheetNames)}";
            var detailed = $"Sheet details:\n{string.Join("\n", sheetsInfo)}";

            return ProcessResponse.CreateSuccess(
                $"{summary}\n\n{detailed}",
                summary,
                new Dictionary<string, object?> { ["sheets"] = sheetNames.ToArray() }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to list sheets: {ex.Message}");
        }
    }

    private async Task<ProcessResponse> ReadExcelContent(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var worksheet = parameters.TryGetProperty("worksheet", out var worksheetElement) ? worksheetElement.GetString() : null;
        var format = parameters.TryGetProperty("outputFormat", out var formatElement) ? formatElement.GetString() : "markdown";

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"File not found: {file}");

        try
        {
            using var workbook = new XLWorkbook(file);
            
            if (workbook.Worksheets.Count == 0)
            {
                return ProcessResponse.CreateSuccess(
                    "Excel file contains no worksheets",
                    "No worksheets found",
                    new Dictionary<string, object?> { ["content"] = "No worksheets found in file" }
                );
            }

            var contentBuilder = new System.Text.StringBuilder();

            // Determine which worksheets to process
            var worksheetsToProcess = new List<IXLWorksheet>();
            if (!string.IsNullOrEmpty(worksheet))
            {
                var targetWorksheet = workbook.Worksheets.FirstOrDefault(w => w.Name.Equals(worksheet, StringComparison.OrdinalIgnoreCase));
                if (targetWorksheet == null)
                {
                    var availableSheets = workbook.Worksheets.Select(w => w.Name).ToArray();
                    return ProcessResponse.CreateFailure($"Worksheet '{worksheet}' not found. Available worksheets: {string.Join(", ", availableSheets)}");
                }
                worksheetsToProcess.Add(targetWorksheet);
            }
            else
            {
                worksheetsToProcess.AddRange(workbook.Worksheets);
            }

            // Process each worksheet based on format
            foreach (var ws in worksheetsToProcess)
            {
                var usedRange = ws.RangeUsed();
                if (usedRange == null) continue;

                switch (format?.ToLower())
                {
                    case "markdown":
                        AppendMarkdownContent(contentBuilder, ws, usedRange);
                        break;
                    case "text":
                        AppendTextContent(contentBuilder, ws, usedRange);
                        break;
                    case "json":
                        AppendJsonContent(contentBuilder, ws, usedRange);
                        break;
                    default:
                        AppendMarkdownContent(contentBuilder, ws, usedRange);
                        break;
                }
            }

            var content = contentBuilder.ToString();
            var summary = $"excel(readContent): Converted {worksheetsToProcess.Count} worksheet(s) to {format} format";

            return ProcessResponse.CreateSuccess(
                content,
                summary,
                new Dictionary<string, object?>
                {
                    ["content"] = content,
                    ["format"] = format,
                    ["worksheetCount"] = worksheetsToProcess.Count,
                    ["worksheets"] = worksheetsToProcess.Select(w => w.Name).ToArray()
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to read Excel content: {ex.Message}");
        }
    }

    // Placeholder methods for other operations
    private async Task<ProcessResponse> CopySheet(JsonElement parameters)
    {
        var sourceFile = parameters.TryGetProperty("sourceFile", out var sourceFileElement) ? sourceFileElement.GetString() : null;
        var targetFile = parameters.TryGetProperty("targetFile", out var targetFileElement) ? targetFileElement.GetString() : null;
        var sourceSheet = parameters.TryGetProperty("sourceSheet", out var sourceSheetElement) ? sourceSheetElement.GetString() : null;
        var targetSheet = parameters.TryGetProperty("targetSheet", out var targetSheetElement) ? targetSheetElement.GetString() : null;

        if (string.IsNullOrEmpty(sourceFile) || string.IsNullOrEmpty(targetFile) || 
            string.IsNullOrEmpty(sourceSheet) || string.IsNullOrEmpty(targetSheet))
        {
            return ProcessResponse.CreateFailure("CopySheet requires: sourceFile, targetFile, sourceSheet, targetSheet");
        }

        if (!File.Exists(sourceFile))
            return ProcessResponse.CreateFailure($"Source file not found: {sourceFile}");

        try
        {
            // Load source workbook
            using var sourceWorkbook = new XLWorkbook(sourceFile);
            var srcWorksheet = sourceWorkbook.Worksheets.FirstOrDefault(w => w.Name == sourceSheet);
            
            if (srcWorksheet == null)
            {
                var availableSheets = sourceWorkbook.Worksheets.Select(w => w.Name).ToArray();
                return ProcessResponse.CreateFailure($"Source sheet '{sourceSheet}' not found. Available sheets: {string.Join(", ", availableSheets)}");
            }

            // Load or create target workbook
            XLWorkbook targetWorkbook;
            if (File.Exists(targetFile))
            {
                targetWorkbook = new XLWorkbook(targetFile);
            }
            else
            {
                targetWorkbook = new XLWorkbook();
            }

            using (targetWorkbook)
            {
                // Check if target sheet already exists
                if (targetWorkbook.Worksheets.Any(w => w.Name == targetSheet))
                {
                    return ProcessResponse.CreateFailure($"Target sheet '{targetSheet}' already exists in '{targetFile}'");
                }

                // Copy the entire worksheet
                var copiedWorksheet = srcWorksheet.CopyTo(targetWorkbook, targetSheet);
                
                targetWorkbook.SaveAs(targetFile);

                var usedRange = GetUsedRange(copiedWorksheet);
                var rowCount = copiedWorksheet.RangeUsed()?.RowCount() ?? 0;

                return ProcessResponse.CreateSuccess(
                    $"Successfully copied sheet '{sourceSheet}' from '{sourceFile}' to '{targetSheet}' in '{targetFile}'. Copied {rowCount} rows. Source used range: {usedRange}",
                    $"Copied sheet '{sourceSheet}' to '{targetSheet}' ({rowCount} rows)",
                    new Dictionary<string, object?>
                    {
                        ["file"] = targetFile,
                        ["sheet"] = targetSheet,
                        ["usedRange"] = usedRange,
                        ["rowCount"] = rowCount
                    }
                );
            }
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to copy sheet: {ex.Message}");
        }
    }
    private async Task<ProcessResponse> AddSheet(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var newSheet = parameters.TryGetProperty("newSheet", out var newSheetElement) ? newSheetElement.GetString() : null;
        var tabColor = parameters.TryGetProperty("tabColor", out var tabColorElement) ? tabColorElement.GetString() : null;

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (string.IsNullOrEmpty(newSheet))
            return ProcessResponse.CreateFailure("New sheet name required");

        try
        {
            XLWorkbook workbook;
            if (File.Exists(file))
            {
                workbook = new XLWorkbook(file);
            }
            else
            {
                workbook = new XLWorkbook();
            }

            using (workbook)
            {
                // Check if sheet already exists
                if (workbook.Worksheets.Any(w => w.Name == newSheet))
                {
                    return ProcessResponse.CreateFailure($"Sheet '{newSheet}' already exists");
                }

                var worksheet = workbook.Worksheets.Add(newSheet);

                // Set tab color if provided
                if (!string.IsNullOrEmpty(tabColor))
                {
                    try
                    {
                        // Parse hex color (remove # if present)
                        var colorHex = tabColor.TrimStart('#');
                        if (colorHex.Length == 6)
                        {
                            // Convert hex to XLColor
                            var r = Convert.ToByte(colorHex.Substring(0, 2), 16);
                            var g = Convert.ToByte(colorHex.Substring(2, 2), 16);
                            var b = Convert.ToByte(colorHex.Substring(4, 2), 16);
                            worksheet.SetTabColor(XLColor.FromArgb(255, r, g, b));
                        }
                        else
                        {
                            return ProcessResponse.CreateFailure($"Invalid color format: {tabColor}. Use hex format like #FF0000");
                        }
                    }
                    catch (Exception ex)
                    {
                        return ProcessResponse.CreateFailure($"Failed to set tab color: {ex.Message}");
                    }
                }

                workbook.SaveAs(file);

                var allSheets = workbook.Worksheets.Select(w => w.Name).ToArray();

                return ProcessResponse.CreateSuccess(
                    $"Added sheet '{newSheet}'",
                    $"Added sheet '{newSheet}'",
                    new Dictionary<string, object?>
                    {
                        ["file"] = file,
                        ["sheet"] = newSheet,
                        ["sheets"] = allSheets
                    }
                );
            }
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to add sheet: {ex.Message}");
        }
    }
    private async Task<ProcessResponse> EditSheet(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;
        var newSheet = parameters.TryGetProperty("newSheet", out var newSheetElement) ? newSheetElement.GetString() : null;
        var tabColor = parameters.TryGetProperty("tabColor", out var tabColorElement) ? tabColorElement.GetString() : null;

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"File not found: {file}");

        if (string.IsNullOrEmpty(sheet))
            return ProcessResponse.CreateFailure("Sheet name required");

        try
        {
            using var workbook = new XLWorkbook(file);
            
            var worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet);
            if (worksheet == null)
            {
                var availableSheets = workbook.Worksheets.Select(w => w.Name).ToArray();
                return ProcessResponse.CreateFailure($"Sheet '{sheet}' not found. Available sheets: {string.Join(", ", availableSheets)}");
            }

            var changes = new List<string>();

            // Rename sheet if new name provided
            if (!string.IsNullOrEmpty(newSheet) && newSheet != sheet)
            {
                // Check if new name already exists
                if (workbook.Worksheets.Any(w => w.Name == newSheet))
                {
                    return ProcessResponse.CreateFailure($"Sheet '{newSheet}' already exists");
                }

                worksheet.Name = newSheet;
                changes.Add($"Renamed to '{newSheet}'");
            }

            // Set tab color if provided (ClosedXML uses different color handling than ExcelJS)
            if (!string.IsNullOrEmpty(tabColor))
            {
                try
                {
                    // Parse hex color (remove # if present)
                    var colorHex = tabColor.TrimStart('#');
                    if (colorHex.Length == 6)
                    {
                        // Convert hex to XLColor
                        var r = Convert.ToByte(colorHex.Substring(0, 2), 16);
                        var g = Convert.ToByte(colorHex.Substring(2, 2), 16);
                        var b = Convert.ToByte(colorHex.Substring(4, 2), 16);
                        worksheet.SetTabColor(XLColor.FromArgb(255, r, g, b));
                        changes.Add($"Set tab color to {tabColor}");
                    }
                    else
                    {
                        return ProcessResponse.CreateFailure($"Invalid color format: {tabColor}. Use hex format like #FF0000");
                    }
                }
                catch (Exception ex)
                {
                    return ProcessResponse.CreateFailure($"Failed to set tab color: {ex.Message}");
                }
            }

            if (changes.Count == 0)
            {
                return ProcessResponse.CreateFailure("No changes specified (provide newSheet or tabColor)");
            }

            workbook.SaveAs(file);

            var updatedSheetName = newSheet ?? sheet;
            var changesSummary = string.Join(", ", changes);
            var allSheets = workbook.Worksheets.Select(w => w.Name).ToArray();

            return ProcessResponse.CreateSuccess(
                $"Sheet '{sheet}' updated: {changesSummary}",
                $"Sheet '{sheet}' updated: {changesSummary}",
                new Dictionary<string, object?>
                {
                    ["file"] = file,
                    ["sheet"] = updatedSheetName,
                    ["sheets"] = allSheets,
                    ["changes"] = changes.ToArray()
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to edit sheet: {ex.Message}");
        }
    }
    private async Task<ProcessResponse> DeleteSheet(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"File not found: {file}");

        if (string.IsNullOrEmpty(sheet))
            return ProcessResponse.CreateFailure("Sheet name required");

        try
        {
            using var workbook = new XLWorkbook(file);

            var worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet);
            if (worksheet == null)
            {
                var availableSheets = workbook.Worksheets.Select(w => w.Name).ToArray();
                return ProcessResponse.CreateFailure($"Sheet '{sheet}' not found. Available sheets: {string.Join(", ", availableSheets)}");
            }

            // Prevent deleting the last sheet
            if (workbook.Worksheets.Count <= 1)
            {
                return ProcessResponse.CreateFailure("Cannot delete the last remaining sheet");
            }

            worksheet.Delete();
            workbook.SaveAs(file);

            var remainingSheets = workbook.Worksheets.Select(w => w.Name).ToArray();

            return ProcessResponse.CreateSuccess(
                $"Deleted sheet '{sheet}'",
                $"Deleted sheet '{sheet}'",
                new Dictionary<string, object?>
                {
                    ["file"] = file,
                    ["sheets"] = remainingSheets
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to delete sheet: {ex.Message}");
        }
    }
    private async Task<ProcessResponse> ReadCSV(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var delimiter = parameters.TryGetProperty("delimiter", out var delimiterElement) ? delimiterElement.GetString() : ",";
        var encoding = parameters.TryGetProperty("encoding", out var encodingElement) ? encodingElement.GetString() : "utf8";

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"CSV file '{file}' does not exist. Please check the file path and try again.");

        try
        {
            var encodingObj = System.Text.Encoding.GetEncoding(encoding ?? "utf-8");
            var csvContent = await File.ReadAllTextAsync(file, encodingObj);
            
            if (string.IsNullOrWhiteSpace(csvContent))
            {
                return ProcessResponse.CreateSuccess(
                    "excel(csvRead): CSV file is empty",
                    $"excel(csvRead): Read 0 rows from {Path.GetFileName(file)}",
                    new Dictionary<string, object?>
                    {
                        ["data"] = new object[0][],
                        ["rowCount"] = 0,
                        ["colCount"] = 0
                    }
                );
            }

            // Parse CSV content
            var records = new List<object[]>();
            var lines = csvContent.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            
            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                
                // Simple CSV parsing (handles basic cases, may need enhancement for complex CSV)
                var fields = ParseCSVLine(line, delimiter ?? ",");
                records.Add(fields);
            }

            var rowCount = records.Count;
            var colCount = records.Count > 0 ? records.Max(row => row.Length) : 0;

            // Create preview for display
            var dataPreview = records.Count > 3 
                ? records.Take(3).Select(row => string.Join("\t", row)).Aggregate((a, b) => a + "\n" + b) + "\n...(truncated for brevity)"
                : records.Select(row => string.Join("\t", row)).Aggregate("", (a, b) => string.IsNullOrEmpty(a) ? b : a + "\n" + b);

            var dataDisplay = records.Count > 0 
                ? $"excel(csvRead): Read {rowCount} rows × {colCount} columns\nData preview:\n{dataPreview}"
                : $"excel(csvRead): CSV file '{file}' is empty";

            return ProcessResponse.CreateSuccess(
                dataDisplay,
                $"excel(csvRead): Read {rowCount} rows from {Path.GetFileName(file)}",
                new Dictionary<string, object?>
                {
                    ["data"] = records.ToArray(),
                    ["rowCount"] = rowCount,
                    ["colCount"] = colCount
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"excel(csvRead): Failed to read CSV file '{file}': {ex.Message}");
        }
    }

    private string[] ParseCSVLine(string line, string delimiter)
    {
        var fields = new List<string>();
        var currentField = "";
        var inQuotes = false;
        var i = 0;
        
        while (i < line.Length)
        {
            var c = line[i];
            
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    // Escaped quote
                    currentField += '"';
                    i += 2;
                }
                else
                {
                    // Start or end of quoted field
                    inQuotes = !inQuotes;
                    i++;
                }
            }
            else if (!inQuotes && line.Substring(i).StartsWith(delimiter))
            {
                // Field separator
                fields.Add(currentField);
                currentField = "";
                i += delimiter.Length;
            }
            else
            {
                currentField += c;
                i++;
            }
        }
        
        // Add the last field
        fields.Add(currentField);
        
        return fields.ToArray();
    }
    private async Task<ProcessResponse> ExportToCSV(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;
        var range = parameters.TryGetProperty("range", out var rangeElement) ? rangeElement.GetString() : null;
        var delimiter = parameters.TryGetProperty("delimiter", out var delimiterElement) ? delimiterElement.GetString() : ",";
        var headers = parameters.TryGetProperty("headers", out var headersElement) ? headersElement.GetBoolean() : true;
        var encoding = parameters.TryGetProperty("encoding", out var encodingElement) ? encodingElement.GetString() : "utf8";

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"Excel file '{file}' does not exist");

        try
        {
            using var workbook = new XLWorkbook(file);

            IXLWorksheet worksheet;
            if (!string.IsNullOrEmpty(sheet))
            {
                worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet);
                if (worksheet == null)
                {
                    var availableSheets = workbook.Worksheets.Select(w => w.Name).ToArray();
                    return ProcessResponse.CreateFailure($"Sheet '{sheet}' not found. Available sheets: {string.Join(", ", availableSheets)}");
                }
            }
            else
            {
                worksheet = workbook.Worksheets.FirstOrDefault();
                if (worksheet == null)
                {
                    return ProcessResponse.CreateFailure("No worksheets found in Excel file");
                }
            }

            // Read data from worksheet
            var result = ReadWorksheetData(worksheet, range);
            if (result.RowCount == 0)
            {
                return ProcessResponse.CreateFailure($"No data found in Excel file '{file}'{(sheet != null ? $" sheet '{sheet}'" : "")}{(range != null ? $" range '{range}'" : "")}");
            }

            // Generate CSV file path
            string csvFilePath;
            if (!string.IsNullOrEmpty(sheet))
            {
                // Use sheet name + Excel file directory
                var excelDir = Path.GetDirectoryName(file) ?? "";
                var sanitizedSheetName = SanitizeFileName(sheet);
                csvFilePath = Path.Combine(excelDir, $"{sanitizedSheetName}.csv");
                
                // Handle duplicate names
                var counter = 1;
                var basePath = csvFilePath;
                while (File.Exists(csvFilePath))
                {
                    var baseName = Path.GetFileNameWithoutExtension(basePath);
                    var extension = Path.GetExtension(basePath);
                    csvFilePath = Path.Combine(Path.GetDirectoryName(basePath) ?? "", $"{baseName}_{counter}{extension}");
                    counter++;
                }
            }
            else
            {
                // Fallback: use Excel file name with .csv extension
                csvFilePath = Path.ChangeExtension(file, ".csv");
            }

            // Convert data to CSV format
            var csvLines = new List<string>();
            foreach (var row in result.Data)
            {
                var csvFields = new List<string>();
                foreach (var cell in row)
                {
                    var cellValue = cell?.ToString() ?? "";
                    
                    // Escape CSV field if it contains delimiter, quotes, or newlines
                    if (cellValue.Contains(delimiter!) || cellValue.Contains('"') || cellValue.Contains('\n') || cellValue.Contains('\r'))
                    {
                        cellValue = '"' + cellValue.Replace("\"", "\"\"") + '"';
                    }
                    csvFields.Add(cellValue);
                }
                csvLines.Add(string.Join(delimiter, csvFields));
            }

            // Write CSV file
            var encodingObj = System.Text.Encoding.GetEncoding(encoding ?? "utf-8");
            await File.WriteAllTextAsync(csvFilePath, string.Join("\n", csvLines), encodingObj);

            return ProcessResponse.CreateSuccess(
                $"excel(csvExport): Exported {result.RowCount} rows from Excel '{file}'{(sheet != null ? $" sheet '{sheet}'" : "")}{(range != null ? $" range '{range}'" : "")} to CSV '{csvFilePath}'",
                $"excel(csvExport): Exported {result.RowCount} rows to {Path.GetFileName(csvFilePath)}",
                new Dictionary<string, object?>
                {
                    ["file"] = csvFilePath,
                    ["rowCount"] = result.RowCount,
                    ["colCount"] = result.ColCount
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"excel(csvExport): Failed to export to CSV: {ex.Message}");
        }
    }

    private string SanitizeFileName(string fileName)
    {
        // Replace invalid filename characters with underscore
        var invalidChars = Path.GetInvalidFileNameChars();
        var sanitized = fileName;
        foreach (var c in invalidChars)
        {
            sanitized = sanitized.Replace(c, '_');
        }
        return sanitized;
    }
    private async Task<ProcessResponse> ImportFromCSV(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var sourceFile = parameters.TryGetProperty("sourceFile", out var sourceFileElement) ? sourceFileElement.GetString() : null;
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;
        var range = parameters.TryGetProperty("range", out var rangeElement) ? rangeElement.GetString() : null;
        var delimiter = parameters.TryGetProperty("delimiter", out var delimiterElement) ? delimiterElement.GetString() : ",";
        var encoding = parameters.TryGetProperty("encoding", out var encodingElement) ? encodingElement.GetString() : "utf8";

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (string.IsNullOrEmpty(sourceFile))
            return ProcessResponse.CreateFailure("sourceFile parameter is required for CSV import operation");

        if (!File.Exists(sourceFile))
            return ProcessResponse.CreateFailure($"Source CSV file '{sourceFile}' does not exist");

        try
        {
            // Read CSV data first
            var encodingObj = System.Text.Encoding.GetEncoding(encoding ?? "utf-8");
            var csvContent = await File.ReadAllTextAsync(sourceFile, encodingObj);
            
            if (string.IsNullOrWhiteSpace(csvContent))
            {
                return ProcessResponse.CreateFailure($"excel(csvImport): CSV file '{sourceFile}' is empty or contains no data");
            }

            // Parse CSV content
            var records = new List<object[]>();
            var lines = csvContent.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            
            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                var fields = ParseCSVLine(line, delimiter ?? ",");
                records.Add(fields);
            }

            if (records.Count == 0)
            {
                return ProcessResponse.CreateFailure($"excel(csvImport): CSV file '{sourceFile}' is empty or contains no data");
            }

            // Import to Excel
            XLWorkbook workbook;
            if (File.Exists(file))
            {
                workbook = new XLWorkbook(file);
            }
            else
            {
                workbook = new XLWorkbook();
            }

            using (workbook)
            {
                IXLWorksheet worksheet;
                if (!string.IsNullOrEmpty(sheet))
                {
                    worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet) 
                               ?? workbook.Worksheets.Add(sheet);
                }
                else
                {
                    worksheet = workbook.Worksheets.FirstOrDefault() 
                               ?? workbook.Worksheets.Add("Sheet1");
                }

                // Determine start position
                int startRow = 1, startCol = 1;
                if (!string.IsNullOrEmpty(range))
                {
                    var cell = worksheet.Cell(range);
                    startRow = cell.Address.RowNumber;
                    startCol = cell.Address.ColumnNumber;
                }

                // Write CSV data to Excel
                for (int r = 0; r < records.Count; r++)
                {
                    for (int c = 0; c < records[r].Length; c++)
                    {
                        var cellValue = records[r][c]?.ToString() ?? "";
                        var cell = worksheet.Cell(startRow + r, startCol + c);
                        cell.Value = cellValue;
                    }
                }

                workbook.SaveAs(file);

                return ProcessResponse.CreateSuccess(
                    $"excel(csvImport): Imported {records.Count} rows from CSV '{sourceFile}' to Excel '{file}'{(sheet != null ? $" sheet '{sheet}'" : "")}{(range != null ? $" starting at '{range}'" : "")}",
                    $"excel(csvImport): Imported {records.Count} rows from {Path.GetFileName(sourceFile)} to {worksheet.Name}",
                    new Dictionary<string, object?>
                    {
                        ["file"] = file,
                        ["sheet"] = worksheet.Name,
                        ["rowCount"] = records.Count,
                        ["colCount"] = records.Count > 0 ? records[0].Length : 0
                    }
                );
            }
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"excel(csvImport): Failed to import CSV file '{sourceFile}': {ex.Message}");
        }
    }

    private async Task<ProcessResponse> AddComment(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var range = parameters.TryGetProperty("range", out var rangeElement) ? rangeElement.GetString() : null;
        var comment = parameters.TryGetProperty("comment", out var commentElement) ? commentElement.GetString() : null;
        var author = parameters.TryGetProperty("author", out var authorElement) ? authorElement.GetString() : null;
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"File not found: {file}");

        if (string.IsNullOrEmpty(range))
            return ProcessResponse.CreateFailure("Range required for comment");

        if (string.IsNullOrEmpty(comment))
            return ProcessResponse.CreateFailure("Comment content required");

        try
        {
            using var workbook = new XLWorkbook(file);

            IXLWorksheet worksheet;
            if (!string.IsNullOrEmpty(sheet))
            {
                worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet);
                if (worksheet == null)
                {
                    var availableSheets = workbook.Worksheets.Select(w => w.Name).ToArray();
                    return ProcessResponse.CreateFailure($"Sheet '{sheet}' not found. Available sheets: {string.Join(", ", availableSheets)}");
                }
            }
            else
            {
                worksheet = workbook.Worksheets.FirstOrDefault();
                if (worksheet == null)
                {
                    return ProcessResponse.CreateFailure("No worksheets found in Excel file");
                }
            }

            int cellCount = 0;

            if (range.Contains(':'))
            {
                // Range of cells
                var rangeObj = worksheet.Range(range);
                foreach (var cell in rangeObj.Cells())
                {
                    var commentObj = cell.CreateComment();
                    commentObj.AddText(comment);
                    if (!string.IsNullOrEmpty(author))
                    {
                        commentObj.Author = author;
                    }
                    cellCount++;
                }
            }
            else
            {
                // Single cell
                var cell = worksheet.Cell(range);
                var commentObj = cell.CreateComment();
                commentObj.AddText(comment);
                if (!string.IsNullOrEmpty(author))
                {
                    commentObj.Author = author;
                }
                cellCount = 1;
            }

            workbook.SaveAs(file);

            var authorInfo = !string.IsNullOrEmpty(author) ? $" by {author}" : "";
            return ProcessResponse.CreateSuccess(
                $"Added comment to {cellCount} cell(s) in {range}{authorInfo}",
                $"Added comment to {cellCount} cell(s) in {range}{authorInfo}",
                new Dictionary<string, object?>
                {
                    ["file"] = file,
                    ["sheet"] = worksheet.Name,
                    ["range"] = range,
                    ["cellCount"] = cellCount
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to add comment: {ex.Message}");
        }
    }

    private async Task<ProcessResponse> MergeCells(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var range = parameters.TryGetProperty("range", out var rangeElement) ? rangeElement.GetString() : null;
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"File not found: {file}");

        if (string.IsNullOrEmpty(range) || !range.Contains(':'))
            return ProcessResponse.CreateFailure("Range required (e.g., A1:C3)");

        try
        {
            using var workbook = new XLWorkbook(file);

            IXLWorksheet worksheet;
            if (!string.IsNullOrEmpty(sheet))
            {
                worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet);
                if (worksheet == null)
                {
                    var availableSheets = workbook.Worksheets.Select(w => w.Name).ToArray();
                    return ProcessResponse.CreateFailure($"Sheet '{sheet}' not found. Available sheets: {string.Join(", ", availableSheets)}");
                }
            }
            else
            {
                worksheet = workbook.Worksheets.FirstOrDefault();
                if (worksheet == null)
                {
                    return ProcessResponse.CreateFailure("No worksheets found in Excel file");
                }
            }

            // Merge the cells
            var rangeObj = worksheet.Range(range);
            rangeObj.Merge();

            workbook.SaveAs(file);

            return ProcessResponse.CreateSuccess(
                $"Merged cells {range}",
                $"Merged cells {range}",
                new Dictionary<string, object?>
                {
                    ["file"] = file,
                    ["sheet"] = worksheet.Name,
                    ["range"] = range
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to merge cells: {ex.Message}");
        }
    }

    private async Task<ProcessResponse> ManageRows(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var operation = parameters.TryGetProperty("operation", out var operationElement) ? operationElement.GetString() : null;
        var rowIndex = parameters.TryGetProperty("rowIndex", out var rowIndexElement) ? rowIndexElement.GetInt32() : 0;
        var count = parameters.TryGetProperty("count", out var countElement) ? countElement.GetInt32() : 1;
        var height = parameters.TryGetProperty("height", out var heightElement) ? heightElement.GetDouble() : 0;
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"File not found: {file}");

        if (string.IsNullOrEmpty(operation))
            return ProcessResponse.CreateFailure("Operation parameter is required (insert, delete, resize)");

        try
        {
            using var workbook = new XLWorkbook(file);

            IXLWorksheet worksheet;
            if (!string.IsNullOrEmpty(sheet))
            {
                worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet);
                if (worksheet == null)
                {
                    var availableSheets = workbook.Worksheets.Select(w => w.Name).ToArray();
                    return ProcessResponse.CreateFailure($"Sheet '{sheet}' not found. Available sheets: {string.Join(", ", availableSheets)}");
                }
            }
            else
            {
                worksheet = workbook.Worksheets.FirstOrDefault();
                if (worksheet == null)
                {
                    return ProcessResponse.CreateFailure("No worksheets found in Excel file");
                }
            }

            string resultMessage;
            switch (operation.ToLower())
            {
                case "insert":
                    if (rowIndex <= 0) rowIndex = 1;
                    worksheet.Row(rowIndex).InsertRowsAbove(count);
                    resultMessage = $"Inserted {count} row(s) at index {rowIndex}";
                    break;

                case "delete":
                    if (rowIndex <= 0) rowIndex = 1;
                    for (int i = 0; i < count; i++)
                    {
                        // Always delete from the same index since rows shift up
                        worksheet.Row(rowIndex).Delete();
                    }
                    resultMessage = $"Deleted {count} row(s) starting at index {rowIndex}";
                    break;

                case "resize":
                    if (rowIndex <= 0) rowIndex = 1;
                    if (height <= 0)
                        return ProcessResponse.CreateFailure("Height parameter required for resize operation");
                    
                    for (int i = rowIndex; i < rowIndex + count; i++)
                    {
                        worksheet.Row(i).Height = height;
                    }
                    resultMessage = $"Resized {count} row(s) starting at index {rowIndex} to height {height}";
                    break;

                default:
                    return ProcessResponse.CreateFailure($"Unknown operation '{operation}'. Supported operations: insert, delete, resize");
            }

            workbook.SaveAs(file);

            return ProcessResponse.CreateSuccess(
                resultMessage,
                resultMessage,
                new Dictionary<string, object?>
                {
                    ["file"] = file,
                    ["sheet"] = worksheet.Name,
                    ["operation"] = operation,
                    ["rowIndex"] = rowIndex,
                    ["count"] = count
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to manage rows: {ex.Message}");
        }
    }

    private async Task<ProcessResponse> ManageCols(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var operation = parameters.TryGetProperty("operation", out var operationElement) ? operationElement.GetString() : null;
        var colIndex = parameters.TryGetProperty("colIndex", out var colIndexElement) ? colIndexElement.GetInt32() : 0;
        var count = parameters.TryGetProperty("count", out var countElement) ? countElement.GetInt32() : 1;
        var width = parameters.TryGetProperty("width", out var widthElement) ? widthElement.GetDouble() : 0;
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"File not found: {file}");

        if (string.IsNullOrEmpty(operation))
            return ProcessResponse.CreateFailure("Operation parameter is required (insert, delete, resize)");

        try
        {
            using var workbook = new XLWorkbook(file);

            IXLWorksheet worksheet;
            if (!string.IsNullOrEmpty(sheet))
            {
                worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet);
                if (worksheet == null)
                {
                    var availableSheets = workbook.Worksheets.Select(w => w.Name).ToArray();
                    return ProcessResponse.CreateFailure($"Sheet '{sheet}' not found. Available sheets: {string.Join(", ", availableSheets)}");
                }
            }
            else
            {
                worksheet = workbook.Worksheets.FirstOrDefault();
                if (worksheet == null)
                {
                    return ProcessResponse.CreateFailure("No worksheets found in Excel file");
                }
            }

            string resultMessage;
            switch (operation.ToLower())
            {
                case "insert":
                    if (colIndex <= 0) colIndex = 1;
                    worksheet.Column(colIndex).InsertColumnsAfter(count);
                    resultMessage = $"Inserted {count} column(s) at index {colIndex}";
                    break;

                case "delete":
                    if (colIndex <= 0) colIndex = 1;
                    for (int i = 0; i < count; i++)
                    {
                        // Always delete from the same index since columns shift left
                        worksheet.Column(colIndex).Delete();
                    }
                    resultMessage = $"Deleted {count} column(s) starting at index {colIndex}";
                    break;

                case "resize":
                    if (colIndex <= 0) colIndex = 1;
                    if (width <= 0)
                        return ProcessResponse.CreateFailure("Width parameter required for resize operation");
                    
                    for (int i = colIndex; i < colIndex + count; i++)
                    {
                        worksheet.Column(i).Width = width;
                    }
                    resultMessage = $"Resized {count} column(s) starting at index {colIndex} to width {width}";
                    break;

                default:
                    return ProcessResponse.CreateFailure($"Unknown operation '{operation}'. Supported operations: insert, delete, resize");
            }

            workbook.SaveAs(file);

            return ProcessResponse.CreateSuccess(
                resultMessage,
                resultMessage,
                new Dictionary<string, object?>
                {
                    ["file"] = file,
                    ["sheet"] = worksheet.Name,
                    ["operation"] = operation,
                    ["colIndex"] = colIndex,
                    ["count"] = count
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to manage columns: {ex.Message}");
        }
    }

    private async Task<ProcessResponse> StyleRange(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var range = parameters.TryGetProperty("range", out var rangeElement) ? rangeElement.GetString() : null;
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"File not found: {file}");

        if (string.IsNullOrEmpty(range))
            return ProcessResponse.CreateFailure("Range parameter required for styling");

        if (!parameters.TryGetProperty("style", out var styleElement))
            return ProcessResponse.CreateFailure("Style parameter required");

        try
        {
            using var workbook = new XLWorkbook(file);

            IXLWorksheet worksheet;
            if (!string.IsNullOrEmpty(sheet))
            {
                worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet);
                if (worksheet == null)
                {
                    var availableSheets = workbook.Worksheets.Select(w => w.Name).ToArray();
                    return ProcessResponse.CreateFailure($"Sheet '{sheet}' not found. Available sheets: {string.Join(", ", availableSheets)}");
                }
            }
            else
            {
                worksheet = workbook.Worksheets.FirstOrDefault();
                if (worksheet == null)
                {
                    return ProcessResponse.CreateFailure("No worksheets found in Excel file");
                }
            }

            var rangeObj = worksheet.Range(range);
            var appliedStyles = new List<string>();

            // Apply font styles
            if (styleElement.TryGetProperty("font", out var fontElement))
            {
                if (fontElement.TryGetProperty("name", out var nameElement))
                {
                    rangeObj.Style.Font.FontName = nameElement.GetString();
                    appliedStyles.Add($"font: {nameElement.GetString()}");
                }
                
                if (fontElement.TryGetProperty("size", out var sizeElement))
                {
                    rangeObj.Style.Font.FontSize = sizeElement.GetDouble();
                    appliedStyles.Add($"size: {sizeElement.GetDouble()}");
                }
                
                if (fontElement.TryGetProperty("bold", out var boldElement))
                {
                    rangeObj.Style.Font.Bold = boldElement.GetBoolean();
                    if (boldElement.GetBoolean()) appliedStyles.Add("bold");
                }
                
                if (fontElement.TryGetProperty("italic", out var italicElement))
                {
                    rangeObj.Style.Font.Italic = italicElement.GetBoolean();
                    if (italicElement.GetBoolean()) appliedStyles.Add("italic");
                }
                
                if (fontElement.TryGetProperty("color", out var colorElement))
                {
                    var color = colorElement.GetString()?.TrimStart('#');
                    if (!string.IsNullOrEmpty(color) && color.Length == 6)
                    {
                        rangeObj.Style.Font.FontColor = XLColor.FromHtml("#" + color);
                        appliedStyles.Add($"font color: #{color}");
                    }
                }
            }

            // Apply fill/background
            if (styleElement.TryGetProperty("fill", out var fillElement))
            {
                if (fillElement.TryGetProperty("fgColor", out var fgColorElement))
                {
                    var color = fgColorElement.GetString()?.TrimStart('#');
                    if (!string.IsNullOrEmpty(color) && color.Length == 6)
                    {
                        rangeObj.Style.Fill.BackgroundColor = XLColor.FromHtml("#" + color);
                        appliedStyles.Add($"background: #{color}");
                    }
                }
            }

            // Apply borders
            if (styleElement.TryGetProperty("border", out var borderElement))
            {
                if (borderElement.TryGetProperty("top", out var topElement) && 
                    topElement.TryGetProperty("style", out var topStyleElement))
                {
                    rangeObj.Style.Border.TopBorder = GetBorderStyle(topStyleElement.GetString());
                    appliedStyles.Add("top border");
                }
                
                if (borderElement.TryGetProperty("bottom", out var bottomElement) && 
                    bottomElement.TryGetProperty("style", out var bottomStyleElement))
                {
                    rangeObj.Style.Border.BottomBorder = GetBorderStyle(bottomStyleElement.GetString());
                    appliedStyles.Add("bottom border");
                }
                
                if (borderElement.TryGetProperty("left", out var leftElement) && 
                    leftElement.TryGetProperty("style", out var leftStyleElement))
                {
                    rangeObj.Style.Border.LeftBorder = GetBorderStyle(leftStyleElement.GetString());
                    appliedStyles.Add("left border");
                }
                
                if (borderElement.TryGetProperty("right", out var rightElement) && 
                    rightElement.TryGetProperty("style", out var rightStyleElement))
                {
                    rangeObj.Style.Border.RightBorder = GetBorderStyle(rightStyleElement.GetString());
                    appliedStyles.Add("right border");
                }
            }

            // Apply alignment
            if (styleElement.TryGetProperty("alignment", out var alignmentElement))
            {
                if (alignmentElement.TryGetProperty("horizontal", out var horizontalElement))
                {
                    rangeObj.Style.Alignment.Horizontal = GetHorizontalAlignment(horizontalElement.GetString());
                    appliedStyles.Add($"align: {horizontalElement.GetString()}");
                }
                
                if (alignmentElement.TryGetProperty("vertical", out var verticalElement))
                {
                    rangeObj.Style.Alignment.Vertical = GetVerticalAlignment(verticalElement.GetString());
                    appliedStyles.Add($"valign: {verticalElement.GetString()}");
                }
                
                if (alignmentElement.TryGetProperty("wrapText", out var wrapTextElement))
                {
                    rangeObj.Style.Alignment.WrapText = wrapTextElement.GetBoolean();
                    if (wrapTextElement.GetBoolean()) appliedStyles.Add("wrap text");
                }
            }

            // Apply number format
            if (styleElement.TryGetProperty("numFmt", out var numFmtElement))
            {
                rangeObj.Style.NumberFormat.Format = numFmtElement.GetString() ?? "";
                appliedStyles.Add($"format: {numFmtElement.GetString()}");
            }

            workbook.SaveAs(file);

            var styleDescription = appliedStyles.Count > 0 
                ? string.Join(", ", appliedStyles)
                : "no styles applied";

            return ProcessResponse.CreateSuccess(
                $"Applied styling to {range}: {styleDescription}",
                $"Applied styling to {range}: {styleDescription}",
                new Dictionary<string, object?>
                {
                    ["file"] = file,
                    ["sheet"] = worksheet.Name,
                    ["range"] = range,
                    ["stylesApplied"] = appliedStyles.ToArray()
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to apply styling: {ex.Message}");
        }
    }

    private XLBorderStyleValues GetBorderStyle(string? style)
    {
        return style?.ToLower() switch
        {
            "thin" => XLBorderStyleValues.Thin,
            "thick" => XLBorderStyleValues.Thick,
            "medium" => XLBorderStyleValues.Medium,
            "double" => XLBorderStyleValues.Double,
            "dotted" => XLBorderStyleValues.Dotted,
            "dashed" => XLBorderStyleValues.Dashed,
            _ => XLBorderStyleValues.Thin
        };
    }

    private XLAlignmentHorizontalValues GetHorizontalAlignment(string? alignment)
    {
        return alignment?.ToLower() switch
        {
            "left" => XLAlignmentHorizontalValues.Left,
            "center" => XLAlignmentHorizontalValues.Center,
            "right" => XLAlignmentHorizontalValues.Right,
            "justify" => XLAlignmentHorizontalValues.Justify,
            _ => XLAlignmentHorizontalValues.Left
        };
    }

    private XLAlignmentVerticalValues GetVerticalAlignment(string? alignment)
    {
        return alignment?.ToLower() switch
        {
            "top" => XLAlignmentVerticalValues.Top,
            "middle" => XLAlignmentVerticalValues.Center,
            "bottom" => XLAlignmentVerticalValues.Bottom,
            _ => XLAlignmentVerticalValues.Center
        };
    }

    private async Task<ProcessResponse> AddValidation(JsonElement parameters)
    {
        var file = parameters.GetProperty("file").GetString();
        var range = parameters.TryGetProperty("range", out var rangeElement) ? rangeElement.GetString() : null;
        var sheet = parameters.TryGetProperty("sheet", out var sheetElement) ? sheetElement.GetString() : null;

        if (string.IsNullOrEmpty(file))
            return ProcessResponse.CreateFailure("File parameter is required");

        if (!File.Exists(file))
            return ProcessResponse.CreateFailure($"File not found: {file}");

        if (string.IsNullOrEmpty(range))
            return ProcessResponse.CreateFailure("Range parameter required for validation");

        if (!parameters.TryGetProperty("validation", out var validationElement))
            return ProcessResponse.CreateFailure("Validation parameter required");

        try
        {
            using var workbook = new XLWorkbook(file);

            IXLWorksheet worksheet;
            if (!string.IsNullOrEmpty(sheet))
            {
                worksheet = workbook.Worksheets.FirstOrDefault(w => w.Name == sheet);
                if (worksheet == null)
                {
                    var availableSheets = workbook.Worksheets.Select(w => w.Name).ToArray();
                    return ProcessResponse.CreateFailure($"Sheet '{sheet}' not found. Available sheets: {string.Join(", ", availableSheets)}");
                }
            }
            else
            {
                worksheet = workbook.Worksheets.FirstOrDefault();
                if (worksheet == null)
                {
                    return ProcessResponse.CreateFailure("No worksheets found in Excel file");
                }
            }

            var rangeObj = worksheet.Range(range);
            
            if (!validationElement.TryGetProperty("type", out var typeElement))
                return ProcessResponse.CreateFailure("Validation type is required");

            var validationType = typeElement.GetString()?.ToLower();
            var allowBlank = validationElement.TryGetProperty("allowBlank", out var allowBlankElement) && allowBlankElement.GetBoolean();

            string validationDescription;

            switch (validationType)
            {
                case "list":
                    if (validationElement.TryGetProperty("formulae", out var formulaeElement) && formulaeElement.ValueKind == JsonValueKind.Array)
                    {
                        var items = new List<string>();
                        foreach (var item in formulaeElement.EnumerateArray())
                        {
                            if (item.GetString() is string str)
                                items.Add(str);
                        }
                        
                        var listValues = string.Join(",", items);
                        var validation = rangeObj.CreateDataValidation();
                        validation.List(listValues, true);
                        validation.IgnoreBlanks = allowBlank;
                        validationDescription = $"list validation with {items.Count} items";
                    }
                    else
                    {
                        return ProcessResponse.CreateFailure("List validation requires 'formulae' array parameter");
                    }
                    break;

                case "whole":
                    var wholeValidation = rangeObj.CreateDataValidation();
                    wholeValidation.WholeNumber.Between(0, int.MaxValue);
                    wholeValidation.IgnoreBlanks = allowBlank;
                    
                    // Set min/max if provided
                    if (validationElement.TryGetProperty("min", out var minElement))
                    {
                        wholeValidation.WholeNumber.Between(minElement.GetInt32(), 
                            validationElement.TryGetProperty("max", out var maxElement) ? maxElement.GetInt32() : int.MaxValue);
                        validationDescription = $"whole number validation (min: {minElement.GetInt32()})";
                    }
                    else
                    {
                        validationDescription = "whole number validation";
                    }
                    break;

                case "decimal":
                    var decimalValidation = rangeObj.CreateDataValidation();
                    decimalValidation.Decimal.Between(0, double.MaxValue);
                    decimalValidation.IgnoreBlanks = allowBlank;
                    
                    if (validationElement.TryGetProperty("min", out var decMinElement))
                    {
                        decimalValidation.Decimal.Between(decMinElement.GetDouble(),
                            validationElement.TryGetProperty("max", out var decMaxElement) ? decMaxElement.GetDouble() : double.MaxValue);
                        validationDescription = $"decimal validation (min: {decMinElement.GetDouble()})";
                    }
                    else
                    {
                        validationDescription = "decimal validation";
                    }
                    break;

                case "date":
                    var dateValidation = rangeObj.CreateDataValidation();
                    dateValidation.Date.Between(DateTime.MinValue, DateTime.MaxValue);
                    dateValidation.IgnoreBlanks = allowBlank;
                    validationDescription = "date validation";
                    break;

                case "time":
                    var timeValidation = rangeObj.CreateDataValidation();
                    timeValidation.Time.Between(TimeSpan.Zero, TimeSpan.MaxValue);
                    timeValidation.IgnoreBlanks = allowBlank;
                    validationDescription = "time validation";
                    break;

                case "textlength":
                    var textValidation = rangeObj.CreateDataValidation();
                    textValidation.TextLength.Between(0, int.MaxValue);
                    textValidation.IgnoreBlanks = allowBlank;
                    
                    if (validationElement.TryGetProperty("min", out var textMinElement))
                    {
                        textValidation.TextLength.Between(textMinElement.GetInt32(),
                            validationElement.TryGetProperty("max", out var textMaxElement) ? textMaxElement.GetInt32() : int.MaxValue);
                        validationDescription = $"text length validation (min: {textMinElement.GetInt32()})";
                    }
                    else
                    {
                        validationDescription = "text length validation";
                    }
                    break;

                case "custom":
                    if (validationElement.TryGetProperty("formulae", out var customFormulaElement) && 
                        customFormulaElement.ValueKind == JsonValueKind.Array &&
                        customFormulaElement.GetArrayLength() > 0)
                    {
                        var formula = customFormulaElement[0].GetString();
                        if (!string.IsNullOrEmpty(formula))
                        {
                            var customValidation = rangeObj.CreateDataValidation();
                            customValidation.Custom(formula);
                            customValidation.IgnoreBlanks = allowBlank;
                            validationDescription = $"custom validation: {formula}";
                        }
                        else
                        {
                            return ProcessResponse.CreateFailure("Custom validation requires a formula");
                        }
                    }
                    else
                    {
                        return ProcessResponse.CreateFailure("Custom validation requires 'formulae' array with formula");
                    }
                    break;

                default:
                    return ProcessResponse.CreateFailure($"Unsupported validation type: {validationType}. Supported: list, whole, decimal, date, time, textLength, custom");
            }

            // Set error message if provided
            if (validationElement.TryGetProperty("errorMessage", out var errorMessageElement))
            {
                var errorMsg = errorMessageElement.GetString();
                if (!string.IsNullOrEmpty(errorMsg))
                {
                    rangeObj.GetDataValidation().ErrorTitle = "Invalid Data";
                    rangeObj.GetDataValidation().ErrorMessage = errorMsg;
                }
            }

            // Set input message if provided
            if (validationElement.TryGetProperty("promptMessage", out var promptMessageElement))
            {
                var promptMsg = promptMessageElement.GetString();
                if (!string.IsNullOrEmpty(promptMsg))
                {
                    rangeObj.GetDataValidation().InputTitle = "Input Required";
                    rangeObj.GetDataValidation().InputMessage = promptMsg;
                }
            }

            workbook.SaveAs(file);

            return ProcessResponse.CreateSuccess(
                $"Added {validationDescription} to {range}",
                $"Added {validationDescription} to {range}",
                new Dictionary<string, object?>
                {
                    ["file"] = file,
                    ["sheet"] = worksheet.Name,
                    ["range"] = range,
                    ["validationType"] = validationType
                }
            );
        }
        catch (Exception ex)
        {
            return ProcessResponse.CreateFailure($"Failed to add validation: {ex.Message}");
        }
    }

    #region Helper Methods

    private (object[][] Data, int RowCount, int ColCount, FormulaInfo[] Formulas) ReadWorksheetData(IXLWorksheet worksheet, string? range)
    {
        var data = new List<object[]>();
        var formulas = new List<FormulaInfo>();

        if (!string.IsNullOrEmpty(range))
        {
            // Read specific range
            var rangeObj = worksheet.Range(range);
            foreach (var row in rangeObj.Rows())
            {
                var rowData = new List<object>();
                foreach (var cell in row.Cells())
                {
                    var cellInfo = GetCellValue(cell);
                    rowData.Add(cellInfo.Value);
                    
                    if (cellInfo.IsFormula && !string.IsNullOrEmpty(cellInfo.Formula))
                    {
                        formulas.Add(new FormulaInfo
                        {
                            Cell = cell.Address.ToString(),
                            Formula = cellInfo.Formula,
                            Value = cellInfo.CalculatedValue
                        });
                    }
                }
                data.Add(rowData.ToArray());
            }
        }
        else
        {
            // Read used range, limited to first 20 rows for performance
            var usedRange = worksheet.RangeUsed();
            if (usedRange != null)
            {
                var maxRows = Math.Min(usedRange.RowCount(), 20);
                for (int r = 1; r <= maxRows; r++)
                {
                    var rowData = new List<object>();
                    for (int c = 1; c <= usedRange.ColumnCount(); c++)
                    {
                        var cell = worksheet.Cell(r, c);
                        var cellInfo = GetCellValue(cell);
                        rowData.Add(cellInfo.Value);
                        
                        if (cellInfo.IsFormula && !string.IsNullOrEmpty(cellInfo.Formula))
                        {
                            formulas.Add(new FormulaInfo
                            {
                                Cell = cell.Address.ToString(),
                                Formula = cellInfo.Formula,
                                Value = cellInfo.CalculatedValue
                            });
                        }
                    }
                    
                    // Only add non-empty rows
                    if (rowData.Any(cell => !string.IsNullOrEmpty(cell?.ToString())))
                    {
                        data.Add(rowData.ToArray());
                    }
                }
            }
        }

        return (data.ToArray(), data.Count, data.FirstOrDefault()?.Length ?? 0, formulas.ToArray());
    }

    private (object Value, bool IsFormula, string? Formula, object? CalculatedValue) GetCellValue(IXLCell cell)
    {
        if (cell.HasFormula)
        {
            return (
                Value: $"={cell.FormulaA1}",
                IsFormula: true,
                Formula: cell.FormulaA1,
                CalculatedValue: cell.Value
            );
        }

        return (
            Value: cell.Value.ToString() ?? "",
            IsFormula: false,
            Formula: null,
            CalculatedValue: null
        );
    }

    private string GetUsedRange(IXLWorksheet worksheet)
    {
        var usedRange = worksheet.RangeUsed();
        if (usedRange == null)
            return "A1:A1";

        return $"A1:{GetColumnLetter(usedRange.ColumnCount())}{usedRange.RowCount()}";
    }

    private string GetColumnLetter(int columnNumber)
    {
        string columnName = "";
        while (columnNumber > 0)
        {
            int modulo = (columnNumber - 1) % 26;
            columnName = Convert.ToChar(65 + modulo) + columnName;
            columnNumber = (columnNumber - modulo) / 26;
        }
        return columnName;
    }

    private string FormatDataPreview(object[][] data)
    {
        if (data.Length == 0) return "No data";
        
        var preview = data.Take(3).Select(row => string.Join("\t", row.Select(cell => cell?.ToString() ?? "")));
        var result = string.Join("\n", preview);
        
        if (data.Length > 3)
            result += "\n...(truncated for brevity)";
            
        return result;
    }

    private void AppendMarkdownContent(System.Text.StringBuilder contentBuilder, IXLWorksheet worksheet, IXLRange usedRange)
    {
        contentBuilder.AppendLine($"## {worksheet.Name}");
        contentBuilder.AppendLine();
        
        var rowCount = usedRange.RowCount();
        var colCount = usedRange.ColumnCount();
        
        // Add table header
        for (int col = 1; col <= colCount; col++)
        {
            var cellValue = worksheet.Cell(1, col).Value.ToString();
            contentBuilder.Append($"| {EscapeMarkdown(cellValue ?? $"Col{col}")} ");
        }
        contentBuilder.AppendLine("|");
        
        // Add separator row
        for (int col = 1; col <= colCount; col++)
        {
            contentBuilder.Append("|---");
        }
        contentBuilder.AppendLine("|");
        
        // Add data rows (starting from row 2 if row 1 looks like headers, otherwise from row 1)
        var startRow = IsHeaderRow(worksheet, usedRange) ? 2 : 1;
        for (int row = startRow; row <= rowCount; row++)
        {
            for (int col = 1; col <= colCount; col++)
            {
                var cellValue = worksheet.Cell(row, col).Value.ToString();
                contentBuilder.Append($"| {EscapeMarkdown(cellValue ?? "")} ");
            }
            contentBuilder.AppendLine("|");
        }
        contentBuilder.AppendLine();
    }
    
    private void AppendTextContent(System.Text.StringBuilder contentBuilder, IXLWorksheet worksheet, IXLRange usedRange)
    {
        contentBuilder.AppendLine($"=== {worksheet.Name} ===");
        
        var rowCount = usedRange.RowCount();
        var colCount = usedRange.ColumnCount();
        
        for (int row = 1; row <= rowCount; row++)
        {
            var rowData = new List<string>();
            for (int col = 1; col <= colCount; col++)
            {
                var cellValue = worksheet.Cell(row, col).Value.ToString();
                rowData.Add(cellValue ?? "");
            }
            contentBuilder.AppendLine(string.Join("\t", rowData));
        }
        contentBuilder.AppendLine();
    }
    
    private void AppendJsonContent(System.Text.StringBuilder contentBuilder, IXLWorksheet worksheet, IXLRange usedRange)
    {
        var worksheetData = new
        {
            name = worksheet.Name,
            data = GetWorksheetJsonData(worksheet, usedRange)
        };
        
        var json = System.Text.Json.JsonSerializer.Serialize(worksheetData, new System.Text.Json.JsonSerializerOptions 
        { 
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });
        
        contentBuilder.AppendLine(json);
        contentBuilder.AppendLine();
    }
    
    private object[][] GetWorksheetJsonData(IXLWorksheet worksheet, IXLRange usedRange)
    {
        var rowCount = usedRange.RowCount();
        var colCount = usedRange.ColumnCount();
        var data = new List<object[]>();
        
        for (int row = 1; row <= rowCount; row++)
        {
            var rowData = new List<object>();
            for (int col = 1; col <= colCount; col++)
            {
                var cell = worksheet.Cell(row, col);
                var cellValue = cell.Value.ToString() ?? "";
                rowData.Add(cellValue);
            }
            data.Add(rowData.ToArray());
        }
        
        return data.ToArray();
    }
    
    private bool IsHeaderRow(IXLWorksheet worksheet, IXLRange usedRange)
    {
        // Simple heuristic: if first row contains mostly text and second row contains numbers/different patterns
        if (usedRange.RowCount() < 2) return false;
        
        var firstRowTextCount = 0;
        var secondRowTextCount = 0;
        var colCount = usedRange.ColumnCount();
        
        for (int col = 1; col <= colCount; col++)
        {
            var firstCell = worksheet.Cell(1, col).Value;
            var secondCell = worksheet.Cell(2, col).Value;
            
            if (!IsNumericValue(firstCell)) firstRowTextCount++;
            if (!IsNumericValue(secondCell)) secondRowTextCount++;
        }
        
        // If first row is mostly text and second row is more numeric, assume first row is header
        return firstRowTextCount > colCount / 2 && secondRowTextCount < firstRowTextCount;
    }
    
    private bool IsNumericValue(XLCellValue value)
    {
        return value.IsNumber || value.IsDateTime;
    }
    
    private string EscapeMarkdown(string text)
    {
        if (string.IsNullOrEmpty(text)) return text;
        
        // Escape markdown special characters
        return text.Replace("|", "\\|")
                  .Replace("*", "\\*")
                  .Replace("_", "\\_")
                  .Replace("`", "\\`")
                  .Replace("#", "\\#");
    }

    #endregion

    private class FormulaInfo
    {
        public string Cell { get; set; } = "";
        public string Formula { get; set; } = "";
        public object? Value { get; set; }
    }
}