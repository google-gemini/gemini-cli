
console.log('Baseline process started. PID:', process.pid);
// Keep the process alive for 30 seconds
setTimeout(() => {
  console.log('Baseline process exiting.');
}, 30000);
