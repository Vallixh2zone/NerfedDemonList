import { store } from '../main.js';
import { fetchList } from '../content.js';
import { score } from '../score.js';
import { session } from '../auth.js';

export default {
    template: `
        <main class="page-home" :class="{ dark: store.dark }">
            <div class="home">
                <section class="home-hero">
                    <div class="home-hero__text">
                        <h1 class="home-title">Nerfed Demon List</h1>
                        <p class="home-lede">
                            Famous extreme demons, nerfed into levels you can actually beat,
                            and ranked from hardest to easiest.
                        </p>
                        <div class="home-actions">
                            <router-link to="/list" class="home-btn home-btn--primary">Browse the list</router-link>
                            <router-link to="/submit" class="home-btn">Submit a record</router-link>
                        </div>
                        <p class="home-note" v-if="session.user && session.user.name">
                            Welcome back, <router-link to="/account">{{ session.user.name }}</router-link>.
                        </p>
                    </div>

                    <div class="home-top panel">
                        <h2>Top 5 right now</h2>
                        <ol v-if="top.length" class="home-top__list">
                            <li v-for="(level, i) in top" :key="level.path" :style="{ '--i': i }">
                                <router-link :to="{ path: '/list', query: { level: level.rank } }" class="home-top__row">
                                    <span class="home-top__rank">{{ level.rank }}</span>
                                    <span class="home-top__name">
                                        {{ level.name }}
                                        <small>Verified by {{ level.verifier }}</small>
                                    </span>
                                    <span class="home-top__pts">{{ points(level) }} pts</span>
                                </router-link>
                            </li>
                        </ol>
                        <ol v-else class="home-top__list home-top__list--loading" aria-hidden="true">
                            <li v-for="i in 5" :key="i"><span class="home-top__ghost"></span></li>
                        </ol>
                        <router-link to="/list" class="home-top__all">
                            See all {{ count || '' }} levels
                        </router-link>
                    </div>
                </section>

                <nav class="home-features panel" aria-label="Site sections">
                    <router-link to="/leaderboard" class="home-feature">
                        <h3>Leaderboard</h3>
                        <p>See who has the most points, by player or by country.</p>
                    </router-link>
                    <router-link to="/roulette" class="home-feature">
                        <h3>Roulette</h3>
                        <p>Get random levels one after another, needing 1% more each time. See how far you get.</p>
                    </router-link>
                    <router-link to="/wheel" class="home-feature">
                        <h3>Wheel</h3>
                        <p>Put any levels on a wheel and spin it to pick what to play next.</p>
                    </router-link>
                    <router-link to="/submit" class="home-feature">
                        <h3>Submit a record</h3>
                        <p>Log in with Discord and send your run for a list mod to check.</p>
                    </router-link>
                    <a href="https://discord.gg/M2KkGySwPG" target="_blank" rel="noopener" class="home-feature">
                        <h3>Discord</h3>
                        <p>Talk to other players, suggest levels and get pinged when your records are checked.</p>
                    </a>
                </nav>

            </div>
        </main>
    `,
    data: () => ({
        store,
        session,
        top: [],
        count: 0,
    }),
    async mounted() {
        const list = (await fetchList()) || [];
        const levels = list.map(([level]) => level);
        this.count = levels.filter(Boolean).length;
        // Keep each level's real rank even if one of them failed to load.
        this.top = levels
            .slice(0, 5)
            .map((level, i) => level && { ...level, rank: i + 1 })
            .filter(Boolean);
    },
    methods: {
        points(level) {
            return score(level.rank, 100, level.percentToQualify);
        },
    },
};
