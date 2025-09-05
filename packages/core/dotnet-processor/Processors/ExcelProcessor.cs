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
    private async Task<ProcessResponse> CopySheet(JsonElement parameters) => ProcessResponse.CreateFailure("CopySheet not implemented yet");
    private async Task<ProcessResponse> AddSheet(JsonElement parameters) => ProcessResponse.CreateFailure("AddSheet not implemented yet");
    private async Task<ProcessResponse> EditSheet(JsonElement parameters) => ProcessResponse.CreateFailure("EditSheet not implemented yet");
    private async Task<ProcessResponse> DeleteSheet(JsonElement parameters) => ProcessResponse.CreateFailure("DeleteSheet not implemented yet");
    private async Task<ProcessResponse> ReadCSV(JsonElement parameters) => ProcessResponse.CreateFailure("ReadCSV not implemented yet");
    private async Task<ProcessResponse> ExportToCSV(JsonElement parameters) => ProcessResponse.CreateFailure("ExportToCSV not implemented yet");
    private async Task<ProcessResponse> ImportFromCSV(JsonElement parameters) => ProcessResponse.CreateFailure("ImportFromCSV not implemented yet");

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