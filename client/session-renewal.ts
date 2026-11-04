// Keep transient verification failures separate from the database connection.
// Server membership leases still expire normally; retries never extend authority locally.
export function startRenewal(
  renew: () => Promise<{ renewAfterSeconds: number }>,
  onStatus: (message: string) => void,
  initialSeconds: number,
) {
  let stopped = false,
    active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const attempt = async () => {
    if (stopped || active) return;
    clearTimeout(timer);
    active = true;
    let delay = 10000;
    try {
      const result = await renew();
      delay = Math.max(10000, result.renewAfterSeconds * 1000);
      if (!stopped) onStatus("");
    } catch {
      if (!stopped)
        onStatus(
          "Community access renewal failed. Retrying automatically; keep the Activity open.",
        );
    } finally {
      active = false;
      if (!stopped) timer = setTimeout(attempt, delay);
    }
  };
  timer = setTimeout(attempt, Math.max(10000, initialSeconds * 1000));
  return {
    retry: attempt,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
