import { round, score } from './score.js';

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = '/data';

/**
 * Records accepted through the website's account system (stored in D1).
 * Returns {} if the backend isn't available (e.g. running the site locally).
 */
let accountRecordsPromise = null;
export function fetchAccountRecords() {
    accountRecordsPromise ??= fetch('/api/records')
        .then((res) => (res.ok ? res.json() : { records: [] }))
        .then(({ records }) => {
            const byLevel = {};
            for (const r of records || []) {
                (byLevel[r.level] ??= []).push({
                    user: r.user,
                    link: r.link,
                    percent: r.percent,
                    hz: r.hz,
                    mobile: r.mobile,
                });
            }
            return byLevel;
        })
        .catch(() => ({}));
    return accountRecordsPromise;
}

/** One record per player per level: keep the best percent (JSON wins ties). */
function mergeRecords(jsonRecords, accountRecords) {
    const best = new Map();
    for (const r of [...(jsonRecords || []), ...(accountRecords || [])]) {
        const key = String(r.user).toLowerCase();
        const cur = best.get(key);
        if (!cur || r.percent > cur.percent) best.set(key, r);
    }
    return [...best.values()];
}

export async function fetchList() {
    const listResult = await fetch(`${dir}/_list.json`);
    const accountRecords = await fetchAccountRecords();
    try {
        const list = await listResult.json();
        return await Promise.all(
            list.map(async (path, rank) => {
                const levelResult = await fetch(`${dir}/${path}.json`);
                try {
                    const level = await levelResult.json();
                    return [
                        {
                            ...level,
                            path,
                            records: mergeRecords(
                                level.records,
                                accountRecords[path],
                            ).sort(
                                (a, b) => b.percent - a.percent,
                            ),
                        },
                        null,
                    ];
                } catch {
                    console.error(`Failed to load level #${rank + 1} ${path}.`);
                    return [null, path];
                }
            }),
        );
    } catch {
        console.error(`Failed to load list.`);
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/_editors.json`);
        const editors = await editorsResults.json();
        return editors;
    } catch {
        return null;
    }
}

/**
 * Public profiles from the account system: { "lowercase name": { name, country, avatar } }.
 * Returns {} if the backend isn't available.
 */
let profilesPromise = null;
export function fetchProfiles() {
    profilesPromise ??= fetch('/api/players')
        .then((res) => (res.ok ? res.json() : { players: [] }))
        .then(({ players }) => {
            const map = {};
            for (const p of players || []) map[p.name.toLowerCase()] = p;
            return map;
        })
        .catch(() => ({}));
    return profilesPromise;
}

/** { name: countryCode } — _players.json, overridden by what players set on their Account page. */
export async function fetchPlayers() {
    let players = {};
    try {
        const res = await fetch(`${dir}/_players.json`);
        players = await res.json();
    } catch {}
    const profiles = await fetchProfiles();
    for (const p of Object.values(profiles)) {
        if (!p.country) continue;
        for (const key of Object.keys(players)) {
            if (key.toLowerCase() === p.name.toLowerCase()) delete players[key];
        }
        players[p.name] = p.country;
    }
    return players;
}

function getCountry(players, name) {
    if (!name || !players) return null;
    const key = Object.keys(players).find(
        (k) => k.toLowerCase() === name.toLowerCase(),
    );
    return key ? players[key] : null;
}

export async function fetchLeaderboard() {
    const list = await fetchList();
    const players = await fetchPlayers();
    const profiles = await fetchProfiles();

    const scoreMap = {};
    const errs = [];

    if (!list) {
        return [[], [], ['Failed to load list']];
    }

    list.forEach(([level, err], rank) => {
        if (err) {
            errs.push(err);
            return;
        }

        // Verification
        const verifier =
            Object.keys(scoreMap).find(
                (u) => u.toLowerCase() === level.verifier.toLowerCase(),
            ) || level.verifier;

        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
        };
        scoreMap[verifier].verified.push({
            rank: rank + 1,
            level: level.name,
            score: score(rank + 1, 100, level.percentToQualify),
            link: level.verification,
        });

        // Records
        level.records.forEach((record) => {
            const user =
                Object.keys(scoreMap).find(
                    (u) => u.toLowerCase() === record.user.toLowerCase(),
                ) || record.user;

            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };

            const { completed, progressed } = scoreMap[user];
            if (record.percent === 100) {
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    score: score(rank + 1, 100, level.percentToQualify),
                    link: record.link,
                });
                return;
            }

            progressed.push({
                rank: rank + 1,
                level: level.name,
                percent: record.percent,
                score: score(rank + 1, record.percent, level.percentToQualify),
                link: record.link,
            });
        });
    });

    // Player leaderboard
    const playerBoard = Object.entries(scoreMap).map(([user, scores]) => {
        const { verified, completed, progressed } = scores;
        const total = [verified, completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + cur.score, 0);

        return {
            user,
            country: getCountry(players, user),
            avatar: profiles[user.toLowerCase()]?.avatar || null,
            total: round(total),
            ...scores,
        };
    });

    playerBoard.sort((a, b) => b.total - a.total);

    // Country leaderboard (with top players)
    const countryMap = {};
    playerBoard.forEach((p) => {
        if (!p.country) return;
        countryMap[p.country] ??= {
            country: p.country,
            total: 0,
            players: [],
        };
        countryMap[p.country].total += p.total;
        countryMap[p.country].players.push({
            user: p.user,
            total: p.total,
        });
    });

    const countryBoard = Object.values(countryMap)
        .map((c) => ({
            country: c.country,
            total: round(c.total),
            playerCount: c.players.length,
            // already sorted because playerBoard is sorted by total
            players: c.players.sort((a, b) => b.total - a.total),
        }))
        .sort((a, b) => b.total - a.total);

    return [playerBoard, countryBoard, errs];
}
