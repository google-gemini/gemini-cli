!! Refering this document when start a new project from scratch.

## Application Structure

The application should be built with Go backend and React frontend.

The architecture should be Single-executable monolithic application with embedded web UI.

### Directory Structure

Create project with the following structure:

```
ProjectRoot/
├── backend/                       # Go backend
│   ├── cmd/                       # Main applications for this project
│   ├── pkg /                       # Library code to be used by external applications
│   ├── internal/                  # Private application and library code
│
├── frontend/                      # React web interface
│   ├── src/
├── Makefile                       # Build automation
└── README.md                      # Project documentation
```

### Backend

Following is a sample code for the backend http server.
Sample code:

```go
//go:embed dist
var staticFS embed.FS

type staticFileSystem struct {
	http.FileSystem
}

// newStaticFileSystem initializes a new staticFileSystem instance
// that serves files from the embedded "dist" directory.
func newStaticFileSystem() *staticFileSystem {
	sub, err := fs.Sub(staticFS, "dist")
	if err != nil {
		panic(err)
	}

	return &staticFileSystem{
		FileSystem: http.FS(sub),
	}
}


func RunnerMain(listenPort int) {

	r := setupRunnerRouters()
	err := http.ListenAndServe(fmt.Sprintf(":%d", listenPort), r)
	if err != nil {
	// deal with error, print error, log error, etc.

	}
}

// Main
// This is the main function of the server. It starts the server and listens for incoming requests.
func Main(listenPort int) {

	zap.L().Info("Starting server", zap.Int("port", listenPort))

	r := setupRoutes() // Assuming this returns *chi.Mux or http.Handler

	// Setup static file serving
	staticManager := newStaticFileSystem()
	fileServer := http.FileServer(staticManager.FileSystem)

	// Add the static file handler to the router `r`
	// This handles serving static assets and provides SPA fallback to index.html
	if chiMux, ok := r.(*chi.Mux); ok {
		chiMux.Get("/*", func(w http.ResponseWriter, req *http.Request) {
			requestedPath := req.URL.Path // Use URL.Path, not RequestURI

			// Check if the requested path corresponds to an actual static file.
			// The `exists` method now only takes the path relative to "dist".
			if !staticManager.exists(requestedPath) {
				// File does not exist, attempt to serve index.html (SPA fallback)
				indexPath := "index.html" // Relative to the "dist" embed root
				indexContent, err := staticFS.ReadFile("dist/" + indexPath)
				if err != nil {
					zap.L().Error("Failed to read index.html for SPA fallback", zap.Error(err), zap.String("path", requestedPath))
					http.NotFound(w, req)
					return
				}
				w.Header().Set("Content-Type", "text/html; charset=utf-8")
				w.Write(indexContent)
				return
			}

			// File exists, serve it.
			// Determine the prefix to strip based on how the handler is mounted.
			// For a "/*" pattern, RoutePattern() is "/*", so pathPrefix becomes "".
			rctx := chi.RouteContext(req.Context())
			pathPrefix := strings.TrimSuffix(rctx.RoutePattern(), "/*")
			http.StripPrefix(pathPrefix, fileServer).ServeHTTP(w, req)
		})
	} else {
		zap.L().Warn("Router is not a *chi.Mux, skipping static file handler setup via Get method.")
		// Optionally, provide a more generic way to add the handler if r is just http.Handler
		// For example, by wrapping r or using a middleware approach if applicable.
	}

	// Start the HTTP server in a goroutine so Main can wait if needed (e.g., for other tasks)
	var wg sync.WaitGroup
	wg.Add(1) // Add 1 for the ListenAndServe goroutine

	go func() {
		defer wg.Done()
		zap.L().Info("HTTP server listening", zap.Int("port", listenPort))
		err := http.ListenAndServe(fmt.Sprintf(":%d", listenPort), r)
		if err != nil {
			// http.ErrServerClosed is a normal error on graceful shutdown, don't log as fatal.
			if err != http.ErrServerClosed {
				// Check if it's a port binding error
				if isPortInUseError(err) {
					zap.L().Fatal(fmt.Sprintf("Port %d is already in use. Please stop the existing process or use a different port.", listenPort), zap.Error(err))
				} else {
					zap.L().Fatal("HTTP server ListenAndServe error", zap.Error(err))
				}
			} else {
				zap.L().Info("HTTP server closed gracefully.")
			}
		}
	}()

	wg.Wait() // Wait for the ListenAndServe goroutine to finish (e.g., on error or shutdown)
	zap.L().Info("Server shutdown complete.")
}
```
