/**
 * Shared helpers used across the app. Plain global functions — loaded first
 * so every other script can call them.
 */

/** HTML-escape a string. Safe in both text and attribute contexts. */
function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Wire a modal's close affordances:
 *  - clicking the modal's own .modal-close button closes it
 *  - clicking outside the modal-card (i.e. the dimmed backdrop) closes it
 *
 * Returns { modal, open(), close() } so callers can trigger it.
 */
function wireModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return { modal: null, open() {}, close() {} };

    const close = () => modal.classList.remove('active');
    const open = () => modal.classList.add('active');

    modal.addEventListener('click', (e) => {
        if (e.target.id === modalId) close();
    });
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    return { modal, open, close };
}
