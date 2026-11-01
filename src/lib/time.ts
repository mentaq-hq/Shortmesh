/**
 * Formats a timeline position as HH:MM:SS.
 *
 * Timeline time is stored in seconds, but a one hour strip must read like a
 * video editor: `01:00:00`, never `3600s`. Pass `decimals` for the playhead
 * readout; the ruler uses whole seconds.
 */
export function formatClock(seconds: number, decimals = 0): string {
	const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
	const places = Math.max(0, Math.min(3, Math.floor(decimals)));
	const factor = 10 ** places;
	// Round first so 59.999 does not print as 00:00:60.00.
	const total = Math.round(safe * factor) / factor;
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const remainder = total - hours * 3600 - minutes * 60;
	const secText =
		places > 0
			? remainder.toFixed(places).padStart(places + 3, '0')
			: Math.floor(remainder).toString().padStart(2, '0');
	return `${hours.toString().padStart(2, '0')}:${minutes
		.toString()
		.padStart(2, '0')}:${secText}`;
}
