import { store } from '../main.js';
import { session, api, discordLogin } from '../auth.js';

export default {
    template: `
        <main class="page-account page-login" :class="{ dark: store.dark }">
            <div class="account-container account-container--narrow">
                <section class="account-card login-card">
                    <div class="tabs login-tabs" role="tablist">
                        <button class="tab" role="tab" :aria-selected="mode === 'login'" :class="{ selected: mode === 'login' }" @click="setMode('login')">Log in</button>
                        <button class="tab" role="tab" :aria-selected="mode === 'register'" :class="{ selected: mode === 'register' }" @click="setMode('register')">Create account</button>
                    </div>

                    <h1>{{ mode === 'login' ? 'Welcome back' : 'Create your account' }}</h1>
                    <p class="muted">
                        {{ mode === 'login'
                            ? 'Log in to submit records and manage your profile.'
                            : 'Make an account with a username and password, or use Discord. You can link Discord later.' }}
                    </p>

                    <p class="account-error" v-if="err">{{ err }}</p>

                    <button class="account-btn login-discord" type="button" @click="discordLogin()">
                        <img src="/assets/discord.svg" alt="" />
                        {{ mode === 'login' ? 'Log in with Discord' : 'Sign up with Discord' }}
                    </button>

                    <div class="login-or" aria-hidden="true"><span>or</span></div>

                    <form class="account-form" @submit.prevent="submit">
                        <label>
                            <span class="type-label-md">Username</span>
                            <input
                                v-model.trim="username"
                                autocomplete="username"
                                autocapitalize="none"
                                spellcheck="false"
                                maxlength="24"
                                required
                            />
                            <span v-if="mode === 'register'" class="login-hint">3–24 characters: letters, numbers, _ . -</span>
                        </label>
                        <label>
                            <span class="type-label-md">Password</span>
                            <input
                                v-model="password"
                                :type="showPassword ? 'text' : 'password'"
                                :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                                maxlength="128"
                                required
                            />
                            <span v-if="mode === 'register'" class="login-hint">At least 8 characters. A short sentence is easy to remember and hard to guess.</span>
                        </label>
                        <label v-if="mode === 'register'">
                            <span class="type-label-md">Confirm password</span>
                            <input
                                v-model="confirm"
                                :type="showPassword ? 'text' : 'password'"
                                autocomplete="new-password"
                                maxlength="128"
                                required
                            />
                        </label>
                        <label class="account-check account-check--inline">
                            <input type="checkbox" v-model="showPassword" />
                            <span>Show password</span>
                        </label>
                        <button class="account-btn" :disabled="busy">
                            {{ busy ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account' }}
                        </button>
                    </form>
                </section>
            </div>
        </main>
    `,
    data: () => ({
        store,
        session,
        mode: 'login',
        username: '',
        password: '',
        confirm: '',
        showPassword: false,
        busy: false,
        err: '',
    }),
    created() {
        if (this.$route.query.mode === 'register') this.mode = 'register';
        this.err = this.$route.query.error || '';
    },
    watch: {
        // Already logged in (e.g. came back from Discord): go on.
        'session.user': {
            handler(user) {
                if (user) this.$router.replace(this.nextPage());
            },
            immediate: true,
        },
    },
    methods: {
        discordLogin,
        setMode(mode) {
            this.mode = mode;
            this.err = '';
            this.confirm = '';
        },
        nextPage() {
            const next = this.$route.query.next;
            // Only send people to pages on this site.
            return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/submit';
        },
        async submit() {
            this.err = '';
            if (this.mode === 'register' && this.password !== this.confirm) {
                this.err = "The passwords don't match.";
                return;
            }
            this.busy = true;
            try {
                const path = this.mode === 'login' ? '/api/auth/password-login' : '/api/auth/register';
                const { user } = await api(path, {
                    method: 'POST',
                    body: { username: this.username, password: this.password },
                });
                this.password = '';
                this.confirm = '';
                session.user = user; // the watcher above moves on to the next page
            } catch (e) {
                this.err = e.message;
            }
            this.busy = false;
        },
    },
};
