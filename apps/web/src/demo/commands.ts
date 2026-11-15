/**
 * The commands the demo's diagnoses give to copy, as the factory writes them: demonstration data, read by the
 * demo and by the e2e that check them on screen (a module without dependencies, which they can import).
 */

/** The fix of factory-live#2: the coder's hook delay raised to 600 s. */
export const HOOK_FIX_COMMAND = 'hermes -p coder config set plugins.hook_callback_timeout 600';
