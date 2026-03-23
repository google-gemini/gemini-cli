import esbuild from 'esbuild';
import fs from 'node:fs'; // Import the full fs module
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const manifestPath = path.resolve(
  __dirname,
  '../src/agents/browser/browser-tools-manifest.json',
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

// Only exclude tools explicitly mentioned in the manifest's exclude list
const excludedToolsFiles = (manifest.exclude || []).map((t) => t.name);

// Basic esbuild plugin to empty out excluded modules
const emptyModulePlugin = {
  name: 'empty-modules',
  setup(build) {
    if (excludedToolsFiles.length === 0) return;

    // Create a filter that matches any of the excluded tools
    const excludeFilter = new RegExp(`(${excludedToolsFiles.join('|')})\\.js$`);

    build.onResolve({ filter: excludeFilter }, (args) => {
      // Check if we are inside a tools directory to avoid accidental matches
      if (
        args.importer.includes('chrome-devtools-mcp') &&
        /[\\/]tools[\\/]/.test(args.importer)
      ) {
        return { path: args.path, namespace: 'empty' };
      }
      return null;
    });

    build.onLoad({ filter: /.*/, namespace: 'empty' }, (_args) => ({
      contents: 'export {};', // Empty module (ESM)
      loader: 'js',
    }));
  },
};

async function bundle() {
  try {
    const entryPoint = path.resolve(
      __dirname,
      '../../../node_modules/chrome-devtools-mcp/build/src/index.js',
    );
    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile: path.resolve(
        __dirname,
        '../dist/bundled/chrome-devtools-mcp.mjs',
      ),
      format: 'esm',
      platform: 'node',
      plugins: [emptyModulePlugin],
      external: [
        'puppeteer-core',
        '/bundled/*',
        '../../../node_modules/puppeteer-core/*',
      ],
      banner: {
        js: 'import { createRequire as __createRequire } from "module"; const require = __createRequire(import.meta.url);',
      },
    });

    // Copy third_party assets
    const srcThirdParty = path.resolve(
      __dirname,
      '../../../node_modules/chrome-devtools-mcp/build/src/third_party',
    );
    const destThirdParty = path.resolve(
      __dirname,
      '../dist/bundled/third_party',
    );

    if (fs.existsSync(srcThirdParty)) {
      if (fs.existsSync(destThirdParty)) {
        fs.rmSync(destThirdParty, { recursive: true, force: true });
      }
      fs.cpSync(srcThirdParty, destThirdParty, {
        recursive: true,
      });
    } else {
      console.warn(`Warning: third_party assets not found at ${srcThirdParty}`);
    }

    // Copy watchdog scripts and dependencies
    const srcTelemetry = path.resolve(
      __dirname,
      '../../../node_modules/chrome-devtools-mcp/build/src/telemetry',
    );
    const destWatchdog = path.resolve(
      __dirname,
      '../dist/bundled/watchdog',
    );
    if (fs.existsSync(srcTelemetry)) {
      fs.mkdirSync(destWatchdog, { recursive: true });
      // Copy main watchdog directory
      fs.cpSync(path.join(srcTelemetry, 'watchdog'), destWatchdog, { recursive: true });
      // Copy shared types needed by watchdog
      fs.copyFileSync(
        path.join(srcTelemetry, 'types.js'),
        path.resolve(__dirname, '../dist/bundled/types.js')
      );
      // Copy logger needed by watchdog
      fs.copyFileSync(
        path.join(srcTelemetry, '../logger.js'),
        path.resolve(__dirname, '../dist/bundled/logger.js')
      );

      // Patch imports in watchdog files to reflect the flattened structure in dist/bundled/
      const watchdogFiles = fs.readdirSync(destWatchdog);
      for (const file of watchdogFiles) {
        if (file.endsWith('.js')) {
          const filePath = path.join(destWatchdog, file);
          let content = fs.readFileSync(filePath, 'utf-8');
          content = content.replace(/\.\.\/\.\.\/logger\.js/g, '../logger.js');
          content = content.replace(/\.\.\/types\.js/g, '../types.js');
          fs.writeFileSync(filePath, content);
        }
      }
    } else {
      console.warn(`Warning: telemetry directory not found at ${srcTelemetry}`);
    }

    // Patch the bundled file to point to the correct watchdog path
    // The original code uses new URL("./watchdog/main.js", import.meta.url)
    // which resolves relative to the bundled file.
    // Our bundling script copies the watchdog to ./watchdog/main.js relative to the bundle.
    // So the original code should work IF esbuild doesn't mangle import.meta.url.
  } catch (error) {
    console.error('Error bundling chrome-devtools-mcp:', error);
    process.exit(1);
  }
}

bundle();
