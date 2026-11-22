import { store } from '../main.js';
import { fetchList } from '../content.js';
import { session, api, login } from '../auth.js';
import Spinner from '../components/Spinner.js';

export default {
    components: { Spinner },
    template: `
        <main class="page-account" :class="{ dark: store.dark }">
            <div class="account-container">
                <p class="account-error" v-if="routeError">{{ routeError }}</p>

                <Spinner v-if="!session.loaded"></Spinner>

                <section v-else-if="!session.user" class="account-card">
                    <h1>Submit a record</h1>
                    <p>Log in with Discord so all your records stay under one name. We only see your Discord username and ID.</p>
                    <button class="account-btn" @click="login()">Log in with Discord</button>
                </section>

                <section v-else-if="session.user.banned" class="account-card">
                    <h1>Submissions disabled</h1>
                    <p>This account can't submit records. Contact a list mod on Discord if you think this is a mistake.</p>
                </section>

                <section v-else-if="!session.user.name || editingName" class="account-card">
                    <h1>Choose your player name</h1>
                    <p>Every record you submit will be listed under this name. If you already have records on the list, use the exact same name and a mod will confirm it's you.</p>
                    <form @submit.prevent="saveName" class="account-form">
                        <label>
                            <span class="type-label-md">Player name</span>
                            <input v-model="nameInput" maxlength="24" required placeholder="e.g. Cesium" />
                        </label>
                        <p class="account-error" v-if="nameError">{{ nameError }}</p>
                        <div class="account-row">
                            <button class="account-btn" :disabled="busy">Save name</button>
                            <button v-if="session.user.name" type="button" class="account-btn account-btn--ghost" @click="editingName = false">Cancel</button>
                        </div>
                    </form>
                </section>

                <section v-else-if="!session.user.nameVerified" class="account-card">
                    <h1>Waiting for a mod</h1>
                    <p><strong>{{ session.user.name }}</strong> already has records on the list, so a mod needs to confirm this account is really you before you can submit. Ping a mod in the Discord with your Discord username (<strong>{{ session.user.discordUsername }}</strong>).</p>
                </section>

                <template v-else>
                    <section class="account-card">
                        <h1>Submit a record</h1>
                        <p class="type-label-md">Submitting as <strong>{{ session.user.name }}</strong>
                            <button v-if="!submissions.length" class="account-link" @click="startEditName">change</button>
                        </p>
                        <p>Read the <a href="https://docs.google.com/document/d/16sG5_3IPdKDBRqeqcuYFX7lBhiN81raWazqgq6hNphU/edit?usp=sharing" target="_blank" rel="noopener">submission requirements</a> first.</p>

                        <form @submit.prevent="submit" class="account-form">
                            <label>
                                <span class="type-label-md">Level</span>
                                <select v-model="form.level" required>
                                    <option value="" disabled>Select a level…</option>
                                    <option v-for="l in levels" :value="l.path">#{{ l.rank }} {{ l.name }} ({{ l.min }}%+)</option>
                                </select>
                            </label>
                            <div class="account-row">
                                <label>
                                    <span class="type-label-md">Percent</span>
                                    <input type="number" v-model.number="form.percent" :min="selectedLevel ? selectedLevel.min : 1" max="100" required />
                                </label>
                                <label>
                                    <span class="type-label-md">FPS / Hz</span>
                                    <input type="number" v-model.number="form.hz" min="30" max="1000" required />
                                </label>
                                <label class="account-check">
                                    <input type="checkbox" v-model="form.mobile" />
                                    <span class="type-label-md">Mobile</span>
                                </label>
                            </div>
                            <label>
                                <span class="type-label-md">Video link</span>
                                <input type="url" v-model.trim="form.link" required placeholder="https://youtu.be/..." />
                            </label>
                            <label>
                                <span class="type-label-md">Raw footage (optional)</span>
                                <input type="url" v-model.trim="form.rawFootage" placeholder="https://drive.google.com/..." />
                            </label>
                            <label>
                                <span class="type-label-md">Notes for mods (optional)</span>
                                <textarea v-model="form.notes" maxlength="500" rows="3"></textarea>
                            </label>
                            <p class="account-error" v-if="submitError">{{ submitError }}</p>
                            <p class="account-ok" v-if="submitOk">Submitted! A mod will review it soon.</p>
                            <button class="account-btn" :disabled="busy">Submit record</button>
                        </form>
                    </section>

                    <section class="account-card" v-if="submissions.length">
                        <h2>Your submissions</h2>
                        <table class="account-table">
                            <tr><th>Level</th><th>%</th><th>Status</th><th>Mod note</th></tr>
                            <tr v-for="s in submissions" :key="s.id">
                                <td><a :href="s.link" target="_blank" rel="noopener">{{ levelName(s.level) }}</a></td>
                                <td>{{ s.percent }}%</td>
                                <td><span class="status" :class="'status--' + s.status">{{ s.status }}</span></td>
                                <td>{{ s.reason || '' }}</td>
                            </tr>
                        </table>
                    </section>
                </template>
            </div>
        </main>
    `,
    data: () => ({
        store,
        session,
        levels: [],
        submissions: [],
        nameInput: '',
        nameError: '',
        editingName: false,
        busy: false,
        submitError: '',
        submitOk: false,
        form: { level: '', percent: 100, hz: 60, mobile: false, link: '', rawFootage: '', notes: '' },
    }),
    computed: {
        routeError() {
            return this.$route.query.error || '';
        },
        selectedLevel() {
            return this.levels.find((l) => l.path === this.form.level);
        },
    },
    watch: {
        'session.user': {
            handler(user) {
                if (user && user.name && user.nameVerified) this.loadSubmissions();
            },
            immediate: true,
        },
    },
    async mounted() {
        const list = (await fetchList()) || [];
        this.levels = list
            .map(([level], i) => level && {
                path: level.path,
                name: level.name,
                rank: i + 1,
                min: i + 1 > 75 ? 100 : level.percentToQualify,
            })
            .filter((l) => l && l.rank <= 150);
    },
    methods: {
        login,
        levelName(path) {
            return this.levels.find((l) => l.path === path)?.name || path;
        },
        startEditName() {
            this.nameInput = session.user.name;
            this.editingName = true;
        },
        async saveName() {
            this.busy = true;
            this.nameError = '';
            try {
                const { user } = await api('/api/me', { method: 'POST', body: { name: this.nameInput } });
                session.user = user;
                this.editingName = false;
            } catch (e) {
                this.nameError = e.message;
            }
            this.busy = false;
        },
        async loadSubmissions() {
            try {
                this.submissions = (await api('/api/submissions')).submissions;
            } catch {}
        },
        async submit() {
            this.busy = true;
            this.submitError = '';
            this.submitOk = false;
            try {
                await api('/api/submissions', { method: 'POST', body: this.form });
                this.submitOk = true;
                this.form = { ...this.form, level: '', link: '', rawFootage: '', notes: '' };
                await this.loadSubmissions();
            } catch (e) {
                this.submitError = e.message;
            }
            this.busy = false;
        },
    },
};
