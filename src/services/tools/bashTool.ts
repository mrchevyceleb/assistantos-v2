export async function executeBashTool(
  input: Record<string, unknown>,
  workspacePath: string
): Promise<string> {
  const command = input.command as string;

  if (!command || typeof command !== 'string') {
    throw new Error('Command is required and must be a string');
  }

  const result = await window.electronAPI.bash.execute(command, workspacePath);

  let output = '';

  if (result.stdout) {
    output += result.stdout;
  }

  if (result.stderr) {
    if (output) output += '\n';
    output += `stderr: ${result.stderr}`;
  }

  if (result.exitCode !== 0) {
    output += `\nExit code: ${result.exitCode}`;
  }

  return output || 'Command completed with no output';
}
