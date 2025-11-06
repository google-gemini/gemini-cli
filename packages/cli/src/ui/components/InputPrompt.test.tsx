function clean(str: string | undefined): string {
  return str ? stripAnsi(str) : '';
}