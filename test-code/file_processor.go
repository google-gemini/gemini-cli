package main

import (
	"bufio"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// FileInfo represents information about a processed file
type FileInfo struct {
	Path         string    `json:"path"`
	Size         int64     `json:"size"`
	ModTime      time.Time `json:"mod_time"`
	MD5Hash      string    `json:"md5_hash"`
	LineCount    int       `json:"line_count"`
	WordCount    int       `json:"word_count"`
	CharCount    int       `json:"char_count"`
	FileType     string    `json:"file_type"`
	IsText       bool      `json:"is_text"`
	ProcessedAt  time.Time `json:"processed_at"`
}

// FileProcessor handles file processing operations
type FileProcessor struct {
	workers    int
	bufferSize int
	results    chan FileInfo
	errors     chan error
	wg         sync.WaitGroup
}

// NewFileProcessor creates a new file processor
func NewFileProcessor(workers, bufferSize int) *FileProcessor {
	return &FileProcessor{
		workers:    workers,
		bufferSize: bufferSize,
		results:    make(chan FileInfo, 100),
		errors:     make(chan error, 100),
	}
}

// ProcessFile processes a single file and returns FileInfo
func (fp *FileProcessor) ProcessFile(filePath string) (*FileInfo, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open file %s: %w", filePath, err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return nil, fmt.Errorf("failed to get file stats for %s: %w", filePath, err)
	}

	// Calculate MD5 hash
	hash := md5.New()
	if _, err := io.Copy(hash, file); err != nil {
		return nil, fmt.Errorf("failed to calculate hash for %s: %w", filePath, err)
	}
	md5Hash := hex.EncodeToString(hash.Sum(nil))

	// Reset file pointer for reading
	file.Seek(0, 0)

	// Count lines, words, and characters
	scanner := bufio.NewScanner(file)
	lineCount := 0
	wordCount := 0
	charCount := 0

	for scanner.Scan() {
		line := scanner.Text()
		lineCount++
		words := strings.Fields(line)
		wordCount += len(words)
		charCount += len(line)
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error scanning file %s: %w", filePath, err)
	}

	// Determine file type
	ext := strings.ToLower(filepath.Ext(filePath))
	fileType := "unknown"
	isText := fp.isTextFile(ext)

	switch ext {
	case ".txt", ".md", ".rst":
		fileType = "text"
	case ".py":
		fileType = "python"
	case ".js", ".ts":
		fileType = "javascript"
	case ".go":
		fileType = "go"
	case ".rs":
		fileType = "rust"
	case ".java":
		fileType = "java"
	case ".cpp", ".cc", ".cxx", ".c":
		fileType = "cpp"
	case ".html", ".htm":
		fileType = "html"
	case ".css":
		fileType = "css"
	case ".json":
		fileType = "json"
	case ".xml":
		fileType = "xml"
	case ".yaml", ".yml":
		fileType = "yaml"
	}

	fileInfo := &FileInfo{
		Path:        filePath,
		Size:        stat.Size(),
		ModTime:     stat.ModTime(),
		MD5Hash:     md5Hash,
		LineCount:   lineCount,
		WordCount:   wordCount,
		CharCount:   charCount,
		FileType:    fileType,
		IsText:      isText,
		ProcessedAt: time.Now(),
	}

	return fileInfo, nil
}

// ProcessDirectory processes all files in a directory recursively
func (fp *FileProcessor) ProcessDirectory(dirPath string) error {
	err := filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			fp.errors <- fmt.Errorf("error accessing path %s: %w", path, err)
			return nil
		}

		if !info.IsDir() {
			fp.wg.Add(1)
			go func(filePath string) {
				defer fp.wg.Done()
				fileInfo, err := fp.ProcessFile(filePath)
				if err != nil {
					fp.errors <- err
					return
				}
				fp.results <- *fileInfo
			}(path)
		}
		return nil
	})

	if err != nil {
		return fmt.Errorf("error walking directory %s: %w", dirPath, err)
	}

	// Wait for all workers to complete
	fp.wg.Wait()
	close(fp.results)
	close(fp.errors)

	return nil
}

// GetResults returns the results channel
func (fp *FileProcessor) GetResults() <-chan FileInfo {
	return fp.results
}

// GetErrors returns the errors channel
func (fp *FileProcessor) GetErrors() <-chan error {
	return fp.errors
}

// isTextFile determines if a file is likely to be a text file based on extension
func (fp *FileProcessor) isTextFile(ext string) bool {
	textExtensions := map[string]bool{
		".txt": true, ".md": true, ".rst": true,
		".py": true, ".js": true, ".ts": true,
		".go": true, ".rs": true, ".java": true,
		".cpp": true, ".cc": true, ".cxx": true, ".c": true,
		".html": true, ".htm": true, ".css": true,
		".json": true, ".xml": true, ".yaml": true, ".yml": true,
		".sh": true, ".bash": true, ".zsh": true,
		".sql": true, ".php": true, ".rb": true,
		".scala": true, ".kt": true, ".swift": true,
	}
	return textExtensions[ext]
}

// FileStats represents aggregated statistics
type FileStats struct {
	TotalFiles    int           `json:"total_files"`
	TotalSize     int64         `json:"total_size"`
	TextFiles     int           `json:"text_files"`
	BinaryFiles   int           `json:"binary_files"`
	FileTypes     map[string]int `json:"file_types"`
	AverageSize   float64       `json:"average_size"`
	ProcessedAt   time.Time     `json:"processed_at"`
}

// CalculateStats calculates statistics from file processing results
func CalculateStats(results []FileInfo) FileStats {
	stats := FileStats{
		FileTypes: make(map[string]int),
		ProcessedAt: time.Now(),
	}

	var totalSize int64
	for _, fileInfo := range results {
		stats.TotalFiles++
		totalSize += fileInfo.Size
		stats.FileTypes[fileInfo.FileType]++

		if fileInfo.IsText {
			stats.TextFiles++
		} else {
			stats.BinaryFiles++
		}
	}

	stats.TotalSize = totalSize
	if stats.TotalFiles > 0 {
		stats.AverageSize = float64(totalSize) / float64(stats.TotalFiles)
	}

	return stats
}

func main() {
	processor := NewFileProcessor(4, 4096)

	// Process current directory
	go func() {
		if err := processor.ProcessDirectory("."); err != nil {
			fmt.Printf("Error processing directory: %v\n", err)
		}
	}()

	// Collect results
	var results []FileInfo
	for fileInfo := range processor.GetResults() {
		results = append(results, fileInfo)
		fmt.Printf("Processed: %s (%s, %d lines, %d words)\n",
			fileInfo.Path, fileInfo.FileType, fileInfo.LineCount, fileInfo.WordCount)
	}

	// Handle errors
	for err := range processor.GetErrors() {
		fmt.Printf("Error: %v\n", err)
	}

	// Calculate and display statistics
	stats := CalculateStats(results)
	fmt.Printf("\nStatistics:\n")
	fmt.Printf("Total files: %d\n", stats.TotalFiles)
	fmt.Printf("Total size: %d bytes\n", stats.TotalSize)
	fmt.Printf("Text files: %d\n", stats.TextFiles)
	fmt.Printf("Binary files: %d\n", stats.BinaryFiles)
	fmt.Printf("Average size: %.2f bytes\n", stats.AverageSize)
	fmt.Printf("File types: %v\n", stats.FileTypes)
}
