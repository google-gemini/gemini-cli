import fs from 'fs';
import path from 'path';

function runNativeCoreDump() {
  console.log("Starting Phase 4: Native Diagnostics via v8.process.report (Without GDB)...");

  const reportFile = path.join(process.cwd(), 'v8_process_core_dump.json');
  
  if (fs.existsSync(reportFile)) {
    fs.unlinkSync(reportFile); // Cleanup previous core dump
  }

  console.log("[Native] Invoking V8's internal 'process.report.writeReport()'");
  // This physically hooks into the native C++ V8 engine and forcefully dumps the OS-level thread registers,
  // C++ stack frames, memory boundaries, and native OS limits—all without requiring Visual Studio `gdb` installations!
  try {
    process.report.writeReport(reportFile);
    
    if (fs.existsSync(reportFile)) {
      const stats = fs.statSync(reportFile);
      console.log(`[Native] Successfully extracted native underlying C++ registers! Core Dump Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      console.log(`[Native] Saved to: ${reportFile}`);
    } else {
      console.error("[ERROR] process.report failed to generate file natively.");
    }
  } catch (err) {
    console.error("[FATAL ERROR] V8 native hook failure:", err.message);
  }
}

runNativeCoreDump();
