import routes from './routes.js';
import { session, loadSession, login, logout } from './auth.js';

export const store = Vue.reactive({
    dark: JSON.parse(localStorage.getItem('dark')) || false,
    toggleDark() {
        // Blend the colours for a moment instead of snapping between themes.
        const root = document.documentElement;
        root.classList.add('theme-switching');
        clearTimeout(this._themeTimer);
        this._themeTimer = setTimeout(() => root.classList.remove('theme-switching'), 400);

        this.dark = !this.dark;
        localStorage.setItem('dark', JSON.stringify(this.dark));
    },
});

// The whole page (not just the header and content) follows the theme.
Vue.watchEffect(() => {
    document.documentElement.classList.toggle('dark', store.dark);
});

const app = Vue.createApp({
    data: () => ({ store, session }),
    methods: { login, logout },
});
const router = VueRouter.createRouter({
    history: VueRouter.createWebHashHistory(),
    routes,
});

app.use(router);

app.mount('#app');
loadSession();
