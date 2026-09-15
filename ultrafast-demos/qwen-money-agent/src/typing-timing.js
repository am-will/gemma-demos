const keyDelays = [42, 65, 50, 78, 55];
// Both prompts share a cadence, 30% faster than the previous 1.2x rate.
export const typingDelay = (index) => keyDelays[index % keyDelays.length] / (1.2 * 1.3);
