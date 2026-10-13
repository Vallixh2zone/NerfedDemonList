import { fetchLeaderboard } from '../content.js';
import { localize, flagUrl, countryName } from '../util.js';
import Spinner from '../components/Spinner.js';

export default {
    components: {
        Spinner,
    },
    data: () => ({
        playerBoard: [],
        countryBoard: [],
        loading: true,
        selected: 0,
        mode: 'players',
        err: [],
    }),
    template: `
        <main v-if="loading">
            <Spinner></Spinner>
        </main>
        <main v-else class="page-leaderboard-container">
            <div class="page-leaderboard">
                <div class="error-container">
                    <p class="error" v-if="err.length > 0">
                        Leaderboard may be incorrect, as the following levels could not be loaded: {{ err.join(', ') }}
                    </p>
                </div>

                <div class="lb-tabs">
    <button
        class="tab type-label-lg"
        :class="{ selected: mode === 'players' }"
        @click="switchMode('players')"
    >Players</button>
    <button
        class="tab type-label-lg"
        :class="{ selected: mode === 'countries' }"
        @click="switchMode('countries')"
    >Countries</button>
</div>
                <div class="board-container">
                    <table class="board" v-if="mode === 'players'">
                        <tr v-for="(ientry, i) in playerBoard">
                            <td class="rank">
                                <p class="type-label-lg">#{{ i + 1 }}</p>
                            </td>
                            <td class="total">
                                <p class="type-label-lg">{{ localize(ientry.total) }}</p>
                            </td>
                            <td class="user" :class="{ 'active': selected == i }">
                                <button @click="selected = i">
                                    <span class="type-label-lg user-with-flag">
                                        <img
                                            v-if="ientry.country"
                                            class="flag"
                                            :src="flagUrl(ientry.country)"
                                            :alt="ientry.country"
                                        />
                                        {{ ientry.user }}
                                    </span>
                                </button>
                            </td>
                        </tr>
                    </table>

                    <table class="board" v-else>
                        <tr v-for="(centry, i) in countryBoard">
                            <td class="rank">
                                <p class="type-label-lg">#{{ i + 1 }}</p>
                            </td>
                            <td class="total">
                                <p class="type-label-lg">{{ localize(centry.total) }}</p>
                            </td>
                            <td class="user" :class="{ 'active': selected == i }">
                                <button @click="selected = i">
                                    <span class="type-label-lg user-with-flag">
                                        <img
                                            class="flag"
                                            :src="flagUrl(centry.country)"
                                            :alt="centry.country"
                                        />
                                        {{ countryName(centry.country) }}
                                        <span class="player-count">({{ centry.playerCount }})</span>
                                    </span>
                                </button>
                            </td>
                        </tr>
                    </table>
                </div>

                <div class="player-container" v-if="mode === 'players' && entry">
                    <div class="player">
                        <h1 class="user-with-flag">
                            <img
                                v-if="entry.country"
                                class="flag flag-lg"
                                :src="flagUrl(entry.country)"
                                :alt="entry.country"
                            />
                            #{{ selected + 1 }} {{ entry.user }}
                        </h1>
                        <h3>{{ entry.total }}</h3>
                        <h2 v-if="entry.verified.length > 0">Verified ({{ entry.verified.length}})</h2>
                        <table class="table">
                            <tr v-for="score in entry.verified">
                                <td class="rank">
                                    <p>#{{ score.rank }}</p>
                                </td>
                                <td class="level">
                                    <a class="type-label-lg" target="_blank" :href="score.link">{{ score.level }}</a>
                                </td>
                                <td class="score">
                                    <p>+{{ localize(score.score) }}</p>
                                </td>
                            </tr>
                        </table>
                        <h2 v-if="entry.completed.length > 0">Completed ({{ entry.completed.length }})</h2>
                        <table class="table">
                            <tr v-for="score in entry.completed">
                                <td class="rank">
                                    <p>#{{ score.rank }}</p>
                                </td>
                                <td class="level">
                                    <a class="type-label-lg" target="_blank" :href="score.link">{{ score.level }}</a>
                                </td>
                                <td class="score">
                                    <p>+{{ localize(score.score) }}</p>
                                </td>
                            </tr>
                        </table>
                        <h2 v-if="entry.progressed.length > 0">Progressed ({{entry.progressed.length}})</h2>
                        <table class="table">
                            <tr v-for="score in entry.progressed">
                                <td class="rank">
                                    <p>#{{ score.rank }}</p>
                                </td>
                                <td class="level">
                                    <a class="type-label-lg" target="_blank" :href="score.link">{{ score.percent }}% {{ score.level }}</a>
                                </td>
                                <td class="score">
                                    <p>+{{ localize(score.score) }}</p>
                                </td>
                            </tr>
                        </table>
                    </div>
                </div>

              <div class="player-container" v-else-if="mode === 'countries' && countryEntry">
    <div class="player">
        <h1 class="user-with-flag">
            <img
                class="flag flag-lg"
                :src="flagUrl(countryEntry.country)"
                :alt="countryEntry.country"
            />
            #{{ selected + 1 }} {{ countryName(countryEntry.country) }}
        </h1>
        <h3>{{ countryEntry.total }} points</h3>
        <p>{{ countryEntry.playerCount }} player(s) from this country</p>

        <h2>Top players</h2>
        <table class="table">
            <tr v-for="(p, i) in countryEntry.players">
                <td class="rank">
                    <p>#{{ i + 1 }}</p>
                </td>
                <td class="level">
                    <span class="type-label-lg">{{ p.user }}</span>
                </td>
                <td class="score">
                    <p>{{ localize(p.total) }}</p>
                </td>
            </tr>
        </table>
    </div>
</div>
            </div>
        </main>
    `,
    computed: {
        entry() {
            return this.playerBoard[this.selected];
        },
        countryEntry() {
            return this.countryBoard[this.selected];
        },
    },
    async mounted() {
        const [playerBoard, countryBoard, err] = await fetchLeaderboard();
        this.playerBoard = playerBoard;
        this.countryBoard = countryBoard;
        this.err = err;
        this.loading = false;
    },
    methods: {
        localize,
        flagUrl,
        countryName,
        switchMode(mode) {
            this.mode = mode;
            this.selected = 0;
        },
    },
};
