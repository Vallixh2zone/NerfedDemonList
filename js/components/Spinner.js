export default {
    template: `
        <div class="spinner" role="status" aria-live="polite">
            <div class="spinner__stage" aria-hidden="true">
                <div class="spinner__shadow"></div>
                <div class="spinner__cube"></div>
            </div>
            <p class="type-label-md">Loading…</p>
        </div>
    `,
};
