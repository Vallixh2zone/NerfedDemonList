import { store } from '../main.js';
import { session, api, login, logout, loadSession, linkDiscord } from '../auth.js';
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
                    <p>Log in to manage your profile.</p>
                    <router-link class="account-btn" :to="{ path: '/login', query: { next: '/account' } }">Log in</router-link>
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
                            <p class="type-label-md">{{ signedInAs }}<template v-if="session.user.staff"> · List mod</template></p>
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

                    <!-- Sign-in methods -->
                    <section class="account-card">
                        <h2>Ways to log in</h2>

                        <div class="signin-method">
                            <div class="signin-method__head">
                                <h3>Username and password</h3>
                                <span class="status" :class="session.user.hasPassword ? 'status--accepted' : 'status--off'">
                                    {{ session.user.hasPassword ? 'On' : 'Off' }}
                                </span>
                            </div>
                            <template v-if="session.user.hasPassword">
                                <p>You log in as <strong>{{ session.user.username }}</strong>.</p>
                                <button v-if="!pwOpen" class="account-link" @click="openPassword">Change password</button>
                            </template>
                            <template v-else>
                                <p>Add a username and password so you can also log in without Discord.</p>
                                <button v-if="!pwOpen" class="account-btn account-btn--ghost" @click="openPassword">Add a password</button>
                            </template>

                            <form v-if="pwOpen" class="account-form" @submit.prevent="savePassword">
                                <label v-if="!session.user.hasPassword">
                                    <span class="type-label-md">Username</span>
                                    <input v-model.trim="pw.username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="24" required />
                                </label>
                                <label v-if="session.user.hasPassword">
                                    <span class="type-label-md">Current password</span>
                                    <input v-model="pw.current" type="password" autocomplete="current-password" maxlength="128" required />
                                </label>
                                <label>
                                    <span class="type-label-md">New password</span>
                                    <input v-model="pw.next" type="password" autocomplete="new-password" maxlength="128" required />
                                </label>
                                <label>
                                    <span class="type-label-md">Confirm new password</span>
                                    <input v-model="pw.confirm" type="password" autocomplete="new-password" maxlength="128" required />
                                </label>
                                <p class="type-label-md">At least 8 characters.<template v-if="session.user.hasPassword"> Changing it logs you out on your other devices.</template></p>
                                <div class="account-row">
                                    <button class="account-btn" :disabled="busy">{{ session.user.hasPassword ? 'Change password' : 'Add password' }}</button>
                                    <button type="button" class="account-btn account-btn--ghost" @click="pwOpen = false">Cancel</button>
                                </div>
                            </form>
                        </div>

                        <div class="signin-method">
                            <div class="signin-method__head">
                                <h3>Discord</h3>
                                <span class="status" :class="session.user.hasDiscord ? 'status--accepted' : 'status--off'">
                                    {{ session.user.hasDiscord ? 'Linked' : 'Not linked' }}
                                </span>
                            </div>
                            <template v-if="session.user.hasDiscord">
                                <p>Linked to <strong>{{ session.user.discordUsername }}</strong>. You can log in with Discord too.</p>
                            </template>
                            <template v-else>
                                <p>Link Discord to log in with it, show your Discord picture, and get pinged when your records are checked.</p>
                                <button class="account-btn account-btn--ghost" @click="linkDiscord()">Link Discord</button>
                            </template>
                        </div>
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
        pwOpen: false,
        pw: { username: '', current: '', next: '', confirm: '' },
        busy: false,
        saved: '',
        err: '',
    }),
    computed: {
        signedInAs() {
            const u = session.user;
            const parts = [];
            if (u.username) parts.push(`Username: ${u.username}`);
            if (u.discordUsername) parts.push(`Discord: ${u.discordUsername}`);
            return parts.join(' · ');
        },
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
    created() {
        // Coming back from linking Discord
        if (this.$route.query.linked) this.saved = 'Discord linked. You can now log in with Discord too.';
        if (this.$route.query.error) this.err = this.$route.query.error;
        if (this.$route.query.linked || this.$route.query.error) loadSession();
    },
    methods: {
        login,
        linkDiscord,
        flagUrl,
        openPassword() {
            this.pw = { username: session.user.username || '', current: '', next: '', confirm: '' };
            this.pwOpen = true;
        },
        savePassword() {
            if (this.pw.next !== this.pw.confirm) {
                this.err = "The new passwords don't match.";
                this.saved = '';
                return;
            }
            const adding = !session.user.hasPassword;
            const body = adding
                ? { username: this.pw.username, newPassword: this.pw.next }
                : { currentPassword: this.pw.current, newPassword: this.pw.next };
            return this.run(async () => {
                session.user = (await api('/api/account/password', { method: 'POST', body })).user;
                this.pw = { username: '', current: '', next: '', confirm: '' };
                this.pwOpen = false;
            }, adding ? 'Password added. You can now log in with your username and password.' : 'Password changed.');
        },
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
