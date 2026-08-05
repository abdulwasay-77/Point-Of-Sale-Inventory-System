// Bridges axiosInstance.js's response interceptor — a plain module that
// runs outside React and can't call useContext — to whatever UI needs
// to react when a backend request fails. Two listeners subscribe to
// this in practice: GlobalErrorModal.jsx (shows the popup) and
// Modal.jsx (gives whichever create/edit form is currently open a
// brief red pulse, so the popup's message and the form that caused it
// stay visually connected even though the message itself only appears
// once, in the popup).
//
// Deliberately a plain array of callbacks, not a real event-emitter
// library — this app never has more than a couple of listeners alive
// at once, so anything heavier would be solving a problem that doesn't
// exist here.
const listeners = new Set()

/**
 * Subscribe to API error events. Returns an unsubscribe function — call
 * it in a useEffect cleanup so a listener from an unmounted component
 * (e.g. a Modal that's since closed) never fires.
 */
export function onApiError(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/** Called by axiosInstance.js's response interceptor on every failed
 * request that hasn't opted out (see the `skipGlobalError` request
 * config used by login and POS checkout). */
export function emitApiError(message) {
  listeners.forEach((callback) => callback(message))
}
