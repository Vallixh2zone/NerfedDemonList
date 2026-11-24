import { store } from "../main.js";
import { embed, flagUrl } from "../util.js";
import { score } from "../score.js";
import { fetchEditors, fetchList, fetchPlayers } from "../content.js";

import Spinner from "../components/Spinner.js";
import LevelAuthors from "../components/List/LevelAuthors.js";

const roleIconMap = {
    owner: "crown",
    admin: "user-gear",
    helper: "user-shield",
    dev: "code",
    trial: "user-lock",
};

export default {
    components: { Spinner, LevelAuthors },
    template: `
        <main v-if="loading">
            <Spinner></Spinner>
        </main>
        <main v-else class="page-list">
            <div class="list-container">
                <table class="list" v-if="list">
                    <tr v-for="([level, err], i) in list">
                        <td class="rank">
                            <p v-if="i + 1 <= 150" class="type-label-lg">#{{ i + 1 }}</p>
                            <p v-else class="type-label-lg">Legacy</p>
                        </td>
                        <td class="level" :class="{ 'active': selected == i, 'error': !level }">
                            <button @click="selected = i">
                                <span class="type-label-lg">{{ level?.name || \`Error (\${err}.json)\` }}</span>
                            </button>
                        </td>
                    </tr>
                </table>
            </div>
            <div class="level-container">
                <transition name="swap" mode="out-in">
                <div class="level panel" v-if="level" :key="selected">
                    <h1>{{ level.name }}</h1>
                    <LevelAuthors :author="level.author" :creators="level.creators" :verifier="level.verifier"></LevelAuthors>
                    <iframe class="video" id="videoframe" :src="video" frameborder="0"></iframe>
                    <ul class="stats">
                        <li>
                            <div class="type-title-sm">Points when completed</div>
                            <p>{{ score(selected + 1, 100, level.percentToQualify) }}</p>
                        </li>
                        <li>
                            <div class="type-title-sm">ID</div>
                            <p>{{ level.id }}</p>
                        </li>
                        <li>
                            <div class="type-title-sm">Password</div>
                            <p>{{ level.password || 'Free to Copy' }}</p>
                        </li>
                    </ul>
                    <h2>Records</h2>
                    <p v-if="selected + 1 <= 75"><strong>{{ level.percentToQualify }}%</strong> or better to qualify</p>
                    <p v-else-if="selected +1 <= 150"><strong>100%</strong> or better to qualify</p>
                    <p v-else>This level does not accept new records.</p>
                    <table class="records">
                        <tr v-for="record in level.records" class="record" :class="{ 'record--complete': record.percent === 100 }">
                            <td class="percent">
                                <p>{{ record.percent }}%</p>
                            </td>
                            <td class="user">
                                <a :href="record.link" target="_blank" class="type-label-lg user-with-flag">
                                    <img
                                        v-if="playerCountry(record.user)"
                                        class="flag"
                                        :src="flagUrl(playerCountry(record.user))"
                                        :alt="playerCountry(record.user)"
                                    />
                                    {{ record.user }}
                                </a>
                            </td>
                            <td class="mobile">
                                <img v-if="record.mobile" :src="\`/assets/phone-landscape\${store.dark ? '-dark' : ''}.svg\`" alt="Mobile">
                            </td>
                            <td class="hz">
                                <p>{{ record.hz }}Hz</p>
                            </td>
                        </tr>
                    </table>
                    <p v-if="!level.records.length && selected + 1 <= 150" class="records-empty muted">
                        No records yet. <router-link to="/submit">Submit the first one.</router-link>
                    </p>
                </div>
                <div v-else class="level level--empty panel" key="empty">
                    <p>(ノಠ益ಠ)ノ彡┻━┻</p>
                    <p class="muted">This level couldn't be loaded.</p>
                </div>
                </transition>
            </div>
            <div class="meta-container">
                <div class="meta panel">
                    <div class="errors" v-show="errors.length > 0">
                        <p class="error" v-for="error of errors">{{ error }}</p>
                    </div>
                    <template v-if="editors">
                        <h3>List Editors</h3>
                        <ol class="editors">
                            <li v-for="editor in editors">
                                <img :src="\`/assets/\${roleIconMap[editor.role]}\${store.dark ? '-dark' : ''}.svg\`" :alt="editor.role">
                                <a v-if="editor.link" class="type-label-lg link" target="_blank" :href="editor.link">{{ editor.name }}</a>
                                <p v-else>{{ editor.name }}</p>
                            </li>
                        </ol>
                    </template>
                </div>
            </div>
        </main>
    `,
    data: () => ({
        list: [],
        editors: [],
        players: {},
        loading: true,
        selected: 0,
        errors: [],
        roleIconMap,
        store,
    }),
    computed: {
        level() {
            return this.list[this.selected][0];
        },
        video() {
            return embed(this.level.verification);
        },
    },
    async mounted() {
        this.list = await fetchList();
        this.editors = await fetchEditors();
        this.players = await fetchPlayers();

        if (!this.list) {
            this.errors = [
                "Failed to load list. Retry in a few minutes or notify list staff.",
            ];
        } else {
            this.errors.push(
                ...this.list
                    .filter(([_, err]) => err)
                    .map(([_, err]) => {
                        return `Failed to load level. (${err}.json)`;
                    })
            );
            if (!this.editors) {
                this.errors.push("Failed to load list editors.");
            }
        }

        // Opened from the home page's Top 5 (e.g. /list?level=3): select that level.
        const wanted = Number(this.$route.query.level);
        const jump = this.list && Number.isInteger(wanted) && wanted >= 1 && wanted <= this.list.length;
        if (jump) this.selected = wanted - 1;

        this.loading = false;

        if (jump) {
            this.$nextTick(() => {
                document
                    .querySelector('.page-list .list .level.active')
                    ?.scrollIntoView({ block: 'center' });
            });
        }
    },
    methods: {
        embed,
        score,
        flagUrl,
        playerCountry(name) {
            if (!name || !this.players) return null;
            const key = Object.keys(this.players).find(
                (k) => k.toLowerCase() === name.toLowerCase()
            );
            return key ? this.players[key] : null;
        },
    },
};
