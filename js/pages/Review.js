import { store } from '../main.js';
import { fetchList } from '../content.js';
import { session, api } from '../auth.js';
import { getYoutubeIdFromUrl } from '../util.js';
import Spinner from '../components/Spinner.js';

function youtubeEmbed(link) {
    try {
        const host = new URL(link).hostname.replace(/^www\.|^m\./, '');
        if (host !== 'youtube.com' && host !== 'youtu.be') return null;
    } catch {
        return null;
    }
    const id = getYoutubeIdFromUrl(link);
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

export default {
    components: { Spinner },
    template: `
        <main class="page-account" :class="{ dark: store.dark }">
            <div class="account-container account-container--wide">
                <Spinner v-if="!session.loaded || (loading && session.user && session.user.staff)"></Spinner>
                <section v-else-if="!session.user || !session.user.staff" class="account-card">
                    <h1>Mods only</h1>
                    <p>Log in with a mod's Discord account to review records.</p>
                </section>
                <template v-else>
                    <p class="account-error" v-if="error">{{ error }}</p>
                    <div class="tabs">
                        <button class="tab type-label-lg" :class="{ selected: tab === 'pending' }" @click="tab = 'pending'">Pending ({{ pending.length }})</button>
                        <button class="tab type-label-lg" :class="{ selected: tab === 'claims' }" @click="tab = 'claims'">Names ({{ claims.length + renames.length }})</button>
                        <button class="tab type-label-lg" :class="{ selected: tab === 'recent' }" @click="tab = 'recent'">Recently reviewed</button>
                    </div>

                    <template v-if="tab === 'pending'">
                        <p v-if="!pending.length" class="account-card">Nothing to review. 🎉</p>
                        <section v-for="s in pending" :key="s.id" class="account-card review-card">
                            <div class="review-video">
                                <iframe v-if="embed(s.link)" :src="embed(s.link)" frameborder="0" allowfullscreen></iframe>
                                <a v-else :href="s.link" target="_blank" rel="noopener noreferrer" class="account-btn">Open video ↗</a>
                            </div>
                            <div class="review-info">
                                <h2>{{ s.user }} — {{ s.percent }}% on {{ levelLabel(s.level) }}</h2>
                                <p class="type-label-md">{{ who(s) }} · {{ s.hz }}Hz{{ s.mobile ? ' · Mobile' : '' }} · {{ ago(s.created_at) }}</p>
                                <p class="type-label-md">Needs {{ minFor(s.level) }}%+ · Current best on this level: {{ currentBest(s.level, s.user) }}</p>
                                <p><a :href="s.link" target="_blank" rel="noopener noreferrer">Video link ↗</a>
                                   <template v-if="s.raw_footage"> · <a :href="s.raw_footage" target="_blank" rel="noopener noreferrer">Raw footage ↗</a></template></p>
                                <p v-if="s.notes" class="review-notes">“{{ s.notes }}”</p>
                                <input v-model="reasons[s.id]" maxlength="300" placeholder="Reason (required to reject, optional to accept)" />
                                <div class="account-row">
                                    <button class="account-btn" :disabled="busy" @click="decide(s, 'accept')">Accept</button>
                                    <button class="account-btn account-btn--danger" :disabled="busy" @click="decide(s, 'reject')">Reject</button>
                                    <button class="account-btn account-btn--ghost" :disabled="busy" @click="userAction(s.user_id, 'ban', s.user)">Ban player</button>
                                </div>
                            </div>
                        </section>
                    </template>

                    <template v-if="tab === 'claims'">
                        <h2 v-if="renames.length">Name change requests</h2>
                        <section v-for="u in renames" :key="'r' + u.id" class="account-card">
                            <h2>{{ u.name }} → {{ u.pending_name }}</h2>
                            <p class="type-label-md">{{ who(u) }} · {{ u.accepted }} accepted record(s) on the site · asked {{ ago(u.pending_name_at) }}</p>
                            <p v-if="u.newNameOnList" class="account-error">⚠ "{{ u.pending_name }}" already has records in the list files. Only approve if this account really is that player.</p>
                            <p v-if="u.oldNameOnList" class="account-error">⚠ "{{ u.name }}" has records in the list files (data/*.json). Those won't move automatically. Rename them in the files too if you approve.</p>
                            <div class="account-row">
                                <button class="account-btn" :disabled="busy" @click="userAction(u.id, 'approve-rename')">Approve</button>
                                <button class="account-btn account-btn--danger" :disabled="busy" @click="userAction(u.id, 'deny-rename')">Deny</button>
                            </div>
                        </section>

                        <h2>New accounts claiming a name</h2>
                        <p class="account-card">These accounts picked a name that already has records on the list. Only confirm if you know the Discord account belongs to that player.</p>
                        <section v-for="u in claims" :key="u.id" class="account-card">
                            <h2>{{ u.name }}</h2>
                            <p class="type-label-md">{{ who(u) }}</p>
                            <div class="account-row">
                                <button class="account-btn" :disabled="busy" @click="userAction(u.id, 'verify-name')">Confirm it's them</button>
                                <button class="account-btn account-btn--ghost" :disabled="busy" @click="userAction(u.id, 'reset-name')">Make them pick another name</button>
                            </div>
                        </section>
                    </template>

                    <template v-if="tab === 'recent'">
                        <section class="account-card">
                            <table class="account-table">
                                <tr><th>Player</th><th>Level</th><th>%</th><th>Status</th><th>By</th><th>Note</th><th></th></tr>
                                <tr v-for="s in recent" :key="s.id">
                                    <td>{{ s.user }}</td>
                                    <td><a :href="s.link" target="_blank" rel="noopener noreferrer">{{ levelLabel(s.level) }}</a></td>
                                    <td>{{ s.percent }}%</td>
                                    <td><span class="status" :class="'status--' + s.status">{{ s.status }}</span></td>
                                    <td>{{ s.reviewer || s.reviewer_username || s.reviewer_discord }}</td>
                                    <td>{{ s.reason || '' }}</td>
                                    <td><button class="account-link" :disabled="busy" @click="decide(s, 'reopen')">undo</button></td>
                                </tr>
                            </table>
                        </section>
                    </template>
                </template>
            </div>
        </main>
    `,
    data: () => ({
        store,
        session,
        loading: true,
        busy: false,
        error: '',
        tab: 'pending',
        pending: [],
        claims: [],
        renames: [],
        recent: [],
        reasons: {},
        levels: {},
    }),
    watch: {
        'session.user': {
            handler(user) {
                if (user && user.staff) this.load();
            },
            immediate: true,
        },
    },
    methods: {
        embed: youtubeEmbed,
        // How to identify the player: Discord if linked, otherwise their NDL username.
        who(u) {
            const discord = u.discord_id && !String(u.discord_id).startsWith('local:');
            const parts = [];
            if (discord) parts.push(`Discord: ${u.discord_username} (ID ${u.discord_id})`);
            if (u.username) parts.push(`Username: ${u.username}`);
            if (!discord) parts.push('No Discord linked');
            return parts.join(' · ');
        },
        async load() {
            this.loading = true;
            try {
                const [data, list] = await Promise.all([api('/api/review'), fetchList()]);
                Object.assign(this, data);
                const levels = {};
                (list || []).forEach(([level], i) => {
                    if (level) levels[level.path] = { ...level, rank: i + 1 };
                });
                this.levels = levels;
            } catch (e) {
                this.error = e.message;
            }
            this.loading = false;
        },
        levelLabel(path) {
            const l = this.levels[path];
            return l ? `#${l.rank} ${l.name}` : path;
        },
        minFor(path) {
            const l = this.levels[path];
            if (!l) return '?';
            return l.rank > 75 ? 100 : l.percentToQualify;
        },
        currentBest(path, user) {
            const r = this.levels[path]?.records.find(
                (r) => r.user.toLowerCase() === String(user).toLowerCase(),
            );
            return r ? `${r.percent}%` : 'none';
        },
        ago(t) {
            const mins = Math.round((Date.now() / 1000 - t) / 60);
            if (mins < 60) return `${mins}m ago`;
            if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
            return `${Math.round(mins / 1440)}d ago`;
        },
        async decide(s, action) {
            this.busy = true;
            this.error = '';
            try {
                await api(`/api/review/${s.id}`, {
                    method: 'POST',
                    body: { action, reason: this.reasons[s.id] || '' },
                });
                await this.load();
            } catch (e) {
                this.error = e.message;
            }
            this.busy = false;
        },
        async userAction(id, action, name) {
            if (action === 'ban' && !window.confirm(`Ban ${name}? Their pending records will be hidden.`)) return;
            this.busy = true;
            this.error = '';
            try {
                await api(`/api/review/users/${id}`, { method: 'POST', body: { action } });
                await this.load();
            } catch (e) {
                this.error = e.message;
            }
            this.busy = false;
        },
    },
};
