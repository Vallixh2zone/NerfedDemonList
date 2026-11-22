import { store } from '../main.js';
import { session, api, login, logout, loadSession } from '../auth.js';
import { flagUrl } from '../util.js';
import { COUNTRY_CODES } from '../countries.js';
import Spinner from '../components/Spinner.js';

// Official country list, sorted by name.
function countryList() {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return COUNTRY_CODES.map((code) => ({ code, name: names.of(code.toUpperCase()) }))
        .sort((x, y) => x.name.localeCompare(y.name));
}

export default {
    components: { Spinner },
    template: `
        <main class="page-account" :class="{ dark: store.dark }">
            <div class="account-container">
                <Spinner v-if="!session.loaded"></Spinner>

                <section v-else-if="!session.user" class="account-card">
                    <h1>Your account</h1>
                    <p>Log in with Discord to manage your profile.</p>
                    <button class="account-btn" @click="login()">Log in with Discord</button>
                </section>

                <template v-else>
                    <section class="account-card account-profile">
                        <img v-if="session.user.avatar && session.user.showAvatar" class="account-avatar" :src="session.user.avatar" alt="" referrerpolicy="no-referrer" />
                        <div v-else class="account-avatar account-avatar--empty">{{ (session.user.name || '?')[0] }}</div>
                        <div>
                            <h1 class="user-with-flag">
                                <img v-if="session.user.country" class="flag flag-lg" :src="flagUrl(session.user.country)" :alt="session.user.country" />
                                {{ session.user.name || 'No name yet' }}
                            </h1>
                            <p class="type-label-md">Discord: {{ session.user.discordUsername }}<template v-if="session.user.staff"> · List mod</template></p>
                        </div>
                    </section>

                    <p class="account-ok" v-if="saved">{{ saved }}</p>
                    <p class="account-error" v-if="err">{{ err }}</p>

                    <!-- Name -->
                    <section class="account-card">
                        <h2>Player name</h2>
                        <template v-if="!session.user.name">
                            <p>You haven't picked a name yet. <router-link to="/submit">Choose one on the Submit page.</router-link></p>
                        </template>
                        <template v-else-if="session.user.pendingName">
                            <p>You asked to change your name to <strong>{{ session.user.pendingName }}</strong>. A mod will approve or deny it soon.</p>
                            <button class="account-btn account-btn--ghost" :disabled="busy" @click="cancelRename">Cancel request</button>
                        </template>
                        <template v-else>
                            <p>All your records are listed under this name. To keep the list fair, name changes are checked by a mod (changing only capital letters is instant). You can change it once every 30 days.</p>
                            <p v-if="cooldownText" class="type-label-md">{{ cooldownText }}</p>
                            <form v-else class="account-form" @submit.prevent="requestRename">
                                <label>
                                    <span class="type-label-md">New name</span>
                                    <input v-model="newName" maxlength="24" required :placeholder="session.user.name" />
                                </label>
                                <label class="account-check account-check--inline">
                                    <input type="checkbox" v-model="renameConfirm" required />
                                    <span>I understand my records will move to the new name once a mod approves it.</span>
                                </label>
                                <button class="account-btn" :disabled="busy || !renameConfirm">Request name change</button>
                            </form>
                        </template>
                    </section>

                    <!-- Profile -->
                    <section class="account-card">
                        <h2>Profile</h2>
                        <label>
                            <span class="type-label-md">Country (shows a flag next to your name)</span>
                            <select v-model="country" @change="saveSettings({ country })" :disabled="busy">
                                <option value="">No country</option>
                                <option v-for="c in countries" :value="c.code">{{ c.name }}</option>
                            </select>
                        </label>
                        <label class="account-check account-check--inline">
                            <input type="checkbox" :checked="session.user.showAvatar" :disabled="busy || !session.user.avatar"
                                @change="saveSettings({ showAvatar: $event.target.checked })" />
                            <span>Show my Discord profile picture on the leaderboard</span>
                        </label>
                        <p class="type-label-md" v-if="!session.user.avatar">You don't have a Discord profile picture. Set one in Discord, then log out and back in here.</p>
                        <p class="type-label-md" v-else>Changed your Discord picture? Log out and back in to update it here.</p>
                    </section>

                    <!-- Notifications -->
                    <section class="account-card">
                        <h2>Notifications</h2>
                        <label class="account-check account-check--inline">
                            <input type="checkbox" :checked="session.user.pingOnReview" :disabled="busy"
                                @change="saveSettings({ pingOnReview: $event.target.checked })" />
                            <span>Ping me in the Discord server when my records are accepted or rejected</span>
                        </label>
                    </section>

                    <!-- Sessions -->
                    <section class="account-card">
                        <h2>Log out</h2>
                        <div class="account-row">
                            <button class="account-btn" :disabled="busy" @click="doLogout">Log out</button>
                            <button class="account-btn account-btn--ghost" :disabled="busy" @click="logoutAll">Log out on all devices</button>
                        </div>
                    </section>
                </template>
            </div>
        </main>
    `,
    data: () => ({
        store,
        session,
        countries: countryList(),
        country: '',
        newName: '',
        renameConfirm: false,
        busy: false,
        saved: '',
        err: '',
    }),
    computed: {
        cooldownText() {
            const next = session.user?.nextNameChange;
            if (!next || next * 1000 <= Date.now()) return '';
            return `You can change your name again on ${new Date(next * 1000).toLocaleDateString()}.`;
        },
    },
    watch: {
        'session.user': {
            handler(user) {
                this.country = user?.country || '';
            },
            immediate: true,
        },
    },
    methods: {
        login,
        flagUrl,
        async run(fn, okMessage) {
            this.busy = true;
            this.err = '';
            this.saved = '';
            try {
                await fn();
                this.saved = okMessage;
            } catch (e) {
                this.err = e.message;
                await loadSession(); // put the form back to what's actually saved
            }
            this.busy = false;
        },
        saveSettings(changes) {
            return this.run(async () => {
                session.user = (await api('/api/account/settings', { method: 'POST', body: changes })).user;
            }, 'Saved. It can take up to a minute to show on the list and leaderboard.');
        },
        requestRename() {
            const name = this.newName.trim();
            if (!window.confirm(`Change your name from "${session.user.name}" to "${name}"?`)) return;
            return this.run(async () => {
                session.user = (await api('/api/account/name', { method: 'POST', body: { name } })).user;
                this.newName = '';
                this.renameConfirm = false;
            }, session.user.name.toLowerCase() === name.toLowerCase()
                ? 'Name updated.'
                : 'Request sent. A mod will review it.');
        },
        cancelRename() {
            return this.run(async () => {
                session.user = (await api('/api/account/name', { method: 'POST', body: { cancel: true } })).user;
            }, 'Request cancelled.');
        },
        async doLogout() {
            await logout();
            this.$router.push('/');
        },
        logoutAll() {
            if (!window.confirm('Log out on every device, including this one?')) return;
            return this.run(async () => {
                await api('/api/account/logout-all', { method: 'POST', body: {} });
                session.user = null;
                this.$router.push('/');
            }, '');
        },
    },
};
