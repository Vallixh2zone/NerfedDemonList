import { store } from '../main.js';
import { fetchList } from '../content.js';
import { score } from '../score.js';
import Spinner from '../components/Spinner.js';

// Saved in the browser so the wheel and history survive a refresh.
const SAVE_KEY = 'wheel';
const HISTORY_LIMIT = 25;
const SPIN_MS = 5200;

function load() {
    try {
        return JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
    } catch {
        return {};
    }
}

/** A fair random whole number from 0 to max - 1. */
function randomInt(max) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    do {
        crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % max;
}

const SIZE = 500; // SVG units
const R = 240; // wheel radius

export default {
    components: { Spinner },
    template: `
        <main v-if="loading" :class="{ dark: store.dark }">
            <Spinner></Spinner>
        </main>
        <main v-else class="page-wheel" :class="{ dark: store.dark }">
            <div class="wheel-layout">

                <!-- Choose levels -->
                <aside class="wheel-side panel">
                    <h2>Levels on the wheel</h2>
                    <p class="muted">Pick any levels from the list. Your wheel is saved in this browser.</p>

                    <div class="picker" ref="picker">
                        <button class="picker__button" @click="pickerOpen = !pickerOpen" :aria-expanded="pickerOpen">
                            <span>{{ selected.length }} of {{ levels.length }} levels selected</span>
                            <span class="picker__chevron" :class="{ open: pickerOpen }" aria-hidden="true"></span>
                        </button>
                        <transition name="drop">
                            <div v-if="pickerOpen" class="picker__menu">
                                <input
                                    v-model="search"
                                    class="picker__search"
                                    type="search"
                                    placeholder="Search levels"
                                    aria-label="Search levels"
                                />
                                <div class="picker__quick">
                                    <button @click="selectAll">All</button>
                                    <button @click="selectTop(10)">Top 10</button>
                                    <button @click="selectTop(25)">Top 25</button>
                                    <button @click="selectNone">None</button>
                                </div>
                                <ul class="picker__list">
                                    <li v-for="level in filteredLevels" :key="level.path">
                                        <label class="picker__item">
                                            <input type="checkbox" :value="level.path" v-model="selected" />
                                            <span class="picker__rank">#{{ level.rank }}</span>
                                            <span class="picker__name">{{ level.name }}</span>
                                        </label>
                                    </li>
                                    <li v-if="!filteredLevels.length" class="picker__empty muted">No levels match "{{ search }}".</li>
                                </ul>
                            </div>
                        </transition>
                    </div>

                    <ul class="wheel-chips" v-if="onWheel.length && onWheel.length <= 40">
                        <li v-for="level in onWheel" :key="level.path">
                            <span>#{{ level.rank }} {{ level.name }}</span>
                            <button @click="remove(level.path)" :aria-label="'Remove ' + level.name" title="Remove from wheel">×</button>
                        </li>
                    </ul>
                </aside>

                <!-- The wheel -->
                <section class="wheel-stage">
                    <div class="wheel">
                        <div class="wheel__pointer" aria-hidden="true"></div>
                        <svg
                            class="wheel__disc"
                            :viewBox="'0 0 ' + SIZE + ' ' + SIZE"
                            :style="{ transform: 'rotate(' + rotation + 'deg)', transitionDuration: spinning ? SPIN_MS + 'ms' : '0ms' }"
                            @transitionend="onSpinEnd"
                            role="img"
                            :aria-label="'Wheel with ' + onWheel.length + ' levels'"
                        >
                            <circle :cx="SIZE / 2" :cy="SIZE / 2" :r="R + 6" class="wheel__rim" />
                            <template v-if="onWheel.length === 1">
                                <circle :cx="SIZE / 2" :cy="SIZE / 2" :r="R" class="wheel__slice wheel__slice--0" />
                            </template>
                            <g v-for="(slice, i) in slices" :key="slice.path">
                                <path v-if="onWheel.length > 1" :d="slice.d" :class="['wheel__slice', 'wheel__slice--' + (i % 3), { 'is-winner': winner && winner.path === slice.path && !spinning }]" />
                                <text
                                    :x="SIZE / 2 + 68"
                                    :y="SIZE / 2"
                                    :transform="slice.labelTransform"
                                    dominant-baseline="middle"
                                    class="wheel__label"
                                    :style="{ fontSize: labelSize + 'px' }"
                                >{{ slice.label }}</text>
                            </g>
                        </svg>
                        <button
                            class="wheel__spin"
                            @click="spin"
                            :disabled="spinning || !onWheel.length"
                        >
                            {{ spinning ? '…' : 'Spin' }}
                        </button>
                    </div>
                    <p v-if="!onWheel.length" class="wheel-empty muted">
                        The wheel is empty. Pick some levels on the left.
                    </p>

                    <!-- Result -->
                    <transition name="swap">
                        <div v-if="winner && !spinning" class="wheel-result panel" :key="spinCount">
                            <p class="wheel-result__rank">#{{ winner.rank }}</p>
                            <h2>{{ winner.name }}</h2>
                            <p class="muted">Verified by {{ winner.verifier }} · {{ points(winner) }} points</p>
                            <div class="wheel-result__id">
                                <span class="muted">ID</span>
                                <strong>{{ winner.id }}</strong>
                                <button class="wheel-link" @click="copyId(winner.id)">{{ copied ? 'Copied' : 'Copy ID' }}</button>
                            </div>
                            <div class="wheel-result__actions">
                                <button class="btn" @click="keep">Keep on wheel</button>
                                <button class="btn btn--ghost" @click="removeWinner">Remove from wheel</button>
                                <router-link :to="{ path: '/list', query: { level: winner.rank } }" class="wheel-link">Open on the list</router-link>
                            </div>
                        </div>
                    </transition>
                </section>

                <!-- History -->
                <aside class="wheel-side panel">
                    <div class="wheel-history__head">
                        <h2>Recent spins</h2>
                        <button v-if="history.length" class="wheel-link" @click="clearHistory">Clear</button>
                    </div>
                    <ol v-if="history.length" class="wheel-history">
                        <li v-for="(h, i) in history" :key="h.at + '-' + i">
                            <router-link :to="{ path: '/list', query: { level: rankOf(h.path) || undefined } }">
                                <span class="wheel-history__rank">#{{ rankOf(h.path) || '?' }}</span>
                                <span class="wheel-history__name">{{ h.name }}</span>
                            </router-link>
                            <span class="wheel-history__meta muted">
                                {{ ago(h.at) }}<template v-if="h.removed"> · removed</template>
                            </span>
                        </li>
                    </ol>
                    <p v-else class="muted">Your spins will show up here.</p>
                </aside>
            </div>
        </main>
    `,
    data: () => ({
        store,
        SIZE,
        R,
        SPIN_MS,
        loading: true,
        levels: [], // every level on the list (ranks 1-150)
        selected: [], // paths of levels on the wheel
        history: [], // { path, name, at, removed }
        pickerOpen: false,
        search: '',
        rotation: 0,
        spinning: false,
        winner: null,
        spinCount: 0,
        copied: false,
        now: Date.now(),
    }),
    computed: {
        byPath() {
            const map = {};
            for (const l of this.levels) map[l.path] = l;
            return map;
        },
        onWheel() {
            // Keep list order so the wheel reads #1, #2, #3... clockwise.
            const chosen = new Set(this.selected);
            return this.levels.filter((l) => chosen.has(l.path));
        },
        filteredLevels() {
            const q = this.search.trim().toLowerCase();
            if (!q) return this.levels;
            return this.levels.filter(
                (l) => l.name.toLowerCase().includes(q) || String(l.rank) === q.replace('#', ''),
            );
        },
        labelSize() {
            const n = this.onWheel.length;
            if (n <= 8) return 16;
            if (n <= 16) return 13;
            if (n <= 30) return 11;
            return 10;
        },
        slices() {
            const n = this.onWheel.length;
            if (!n) return [];
            const step = 360 / n;
            const c = SIZE / 2;
            // How much of the name fits between the hub and the rim.
            const maxChars = n <= 8 ? 13 : n <= 16 ? 16 : n <= 30 ? 15 : 0;
            return this.onWheel.map((level, i) => {
                const a0 = ((i * step - 90) * Math.PI) / 180;
                const a1 = (((i + 1) * step - 90) * Math.PI) / 180;
                const large = step > 180 ? 1 : 0;
                const d = `M ${c} ${c} L ${c + R * Math.cos(a0)} ${c + R * Math.sin(a0)} A ${R} ${R} 0 ${large} 1 ${c + R * Math.cos(a1)} ${c + R * Math.sin(a1)} Z`;
                const mid = i * step + step / 2 - 90;
                let label = `#${level.rank}`;
                if (maxChars) {
                    // Every level starts with "Nerfed", so leave it off to fit more of the name.
                    const short = level.name.replace(/^nerfed\s+/i, '');
                    const name = short.length > maxChars ? short.slice(0, maxChars - 1) + '…' : short;
                    label = `#${level.rank} ${name}`;
                }
                return {
                    path: level.path,
                    d,
                    label,
                    // Text runs from near the centre out towards the rim.
                    labelTransform: `rotate(${mid} ${c} ${c})`,
                };
            });
        },
    },
    watch: {
        selected() {
            this.save();
        },
    },
    async mounted() {
        const list = (await fetchList()) || [];
        this.levels = list
            .map(([level], i) => level && { ...level, rank: i + 1 })
            .filter((l) => l && l.rank <= 150);

        const saved = load();
        const valid = new Set(this.levels.map((l) => l.path));
        this.selected = Array.isArray(saved.selected)
            ? saved.selected.filter((p) => valid.has(p))
            : this.levels.slice(0, 10).map((l) => l.path); // first visit: top 10
        this.history = Array.isArray(saved.history) ? saved.history.slice(0, HISTORY_LIMIT) : [];
        this.loading = false;

        document.addEventListener('click', this.onOutsideClick);
        this.timer = setInterval(() => (this.now = Date.now()), 30000);
    },
    beforeUnmount() {
        document.removeEventListener('click', this.onOutsideClick);
        clearInterval(this.timer);
    },
    methods: {
        save() {
            try {
                localStorage.setItem(
                    SAVE_KEY,
                    JSON.stringify({ selected: this.selected, history: this.history }),
                );
            } catch {}
        },
        onOutsideClick(e) {
            if (this.pickerOpen && this.$refs.picker && !this.$refs.picker.contains(e.target)) {
                this.pickerOpen = false;
            }
        },
        selectAll() {
            this.selected = this.levels.map((l) => l.path);
        },
        selectTop(n) {
            this.selected = this.levels.slice(0, n).map((l) => l.path);
        },
        selectNone() {
            this.selected = [];
        },
        remove(path) {
            this.selected = this.selected.filter((p) => p !== path);
            if (this.winner && this.winner.path === path) this.winner = null;
        },
        spin() {
            const n = this.onWheel.length;
            if (!n || this.spinning) return;

            const index = randomInt(n);
            const step = 360 / n;
            // Land somewhere inside the slice, not always dead centre.
            const jitter = (Math.random() - 0.5) * step * 0.7;
            const target = index * step + step / 2 + jitter; // angle on the wheel under the pointer
            const current = ((this.rotation % 360) + 360) % 360;
            const delta = ((-target - current) % 360 + 360) % 360;
            const turns = 5 + randomInt(3);

            this.winner = this.onWheel[index];
            this.copied = false;
            this.spinning = true;
            this.pickerOpen = false;
            // Let the browser register the starting angle before turning.
            requestAnimationFrame(() => {
                this.rotation += turns * 360 + delta;
            });
            // Fallback in case the transition end event never fires.
            clearTimeout(this.spinTimer);
            this.spinTimer = setTimeout(() => this.onSpinEnd(), SPIN_MS + 400);
        },
        onSpinEnd(e) {
            if (e && e.target !== e.currentTarget) return;
            if (!this.spinning) return;
            clearTimeout(this.spinTimer);
            this.spinning = false;
            this.spinCount++;
            this.history.unshift({ path: this.winner.path, name: this.winner.name, at: Date.now() });
            this.history = this.history.slice(0, HISTORY_LIMIT);
            this.save();
        },
        keep() {
            this.winner = null;
        },
        removeWinner() {
            const path = this.winner.path;
            if (this.history[0] && this.history[0].path === path) this.history[0].removed = true;
            this.remove(path);
            this.save();
        },
        clearHistory() {
            this.history = [];
            this.save();
        },
        async copyId(id) {
            try {
                await navigator.clipboard.writeText(String(id));
                this.copied = true;
                setTimeout(() => (this.copied = false), 1500);
            } catch {}
        },
        points(level) {
            return score(level.rank, 100, level.percentToQualify);
        },
        rankOf(path) {
            return this.byPath[path]?.rank;
        },
        ago(t) {
            const mins = Math.round((this.now - t) / 60000);
            if (mins < 1) return 'just now';
            if (mins < 60) return `${mins}m ago`;
            if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
            return `${Math.round(mins / 1440)}d ago`;
        },
    },
};
