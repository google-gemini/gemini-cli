# 0. install bun and the project, build bundle/gemini.js
# brew tap oven-sh/bun/bun # for macOS and Linux
# brew install bun 
# npm install .
# npm run build 

# 1. First, make sure your dist/index.js exists
ls -la dist/index.js

# 2. Build for both architectures
bun build bundle/gemini.js --compile --outfile dist/gemini-x64 --minify --target=bun-darwin-x64
bun build bundle/gemini.js --compile --outfile dist/gemini-arm64 --minify --target=bun-darwin-arm64
bun build bundle/gemini.js --compile --outfile dist/gemini-x64 --minify --target=bun-windows-x64

# 3. Create the universal binary
lipo -create -output dist/gemini dist/gemini-x64 dist/gemini-arm64

# 4. Now you can sign it
codesign --force --sign - ./dist/gemini

# 5. Verify it worked
ls -la dist/gemini
codesign --verify --verbose dist/gemini