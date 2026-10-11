export function getStudentCodeErrorMessage(status: number, serverMessage?: string): string {
  if (status === 429) {
    return "Too many code attempts. Wait a moment, then try again.";
  }

  if (status === 400 || status === 404 || /invalid|expired|not found/i.test(serverMessage ?? "")) {
    return "That access code isn't valid. Check the six characters and try again.";
  }

  return "We couldn't verify that code. Please try again.";
}
