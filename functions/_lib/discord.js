// Posts review results to a Discord channel.
// Uses the bot from your Discord app (DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID).
// Alternatively, set DISCORD_WEBHOOK_URL to post through a channel webhook instead.
// If none are set, nothing is posted and reviewing still works normally.

const COLORS = { accepted: 0x23a55a, rejected: 0xda373c };

function field(name, value, inline = true) {
    return { name, value: String(value ?? '—').slice(0, 1024) || '—', inline };
}

async function botGet(env, path) {
    const res = await fetch(`https://discord.com/api/v10${path}`, {
        headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}` },
    });
    return res.ok ? res.json() : null;
}

/** True if this Discord user is a member of the server the results channel is in. */
async function isInServer(env, discordId) {
    if (!/^\d{1,25}$/.test(String(discordId || ''))) return false;
    try {
        const channel = await botGet(env, `/channels/${env.DISCORD_CHANNEL_ID}`);
        if (!channel?.guild_id) return false;
        const member = await botGet(env, `/guilds/${channel.guild_id}/members/${discordId}`);
        return !!member;
    } catch {
        return false;
    }
}

export async function notifyReview(env, s) {
    const useBot = env.DISCORD_BOT_TOKEN && env.DISCORD_CHANNEL_ID;
    if (!useBot && !env.DISCORD_WEBHOOK_URL) return;

    const status = s.status === 'accepted' ? 'Accepted' : 'Rejected';
    const fields = [
        field('Level', s.levelName),
        field('Player', s.player),
        field('Percentage', `${s.percent}%`),
        field('Video', s.link, false),
        field('Refresh Rate', `${s.hz}Hz`),
        field('Mobile', s.mobile ? 'Yes' : 'No'),
        field('Status', status),
    ];
    if (s.reason) fields.push(field(`Staff Comment — ${s.reviewer}`, s.reason, false));
    fields.push(field('Reviewed By', s.reviewer, false));

    // Ping the player if they allow it and are actually in the server (bot mode only).
    const ping = useBot && s.ping_on_review !== 0 && (await isInServer(env, s.discord_id)) ? String(s.discord_id) : null;

    const payload = {
        content: ping ? `<@${ping}>` : undefined,
        embeds: [
            {
                title: s.status === 'accepted' ? 'Record Accepted' : 'Record Rejected',
                color: COLORS[s.status],
                fields,
                timestamp: new Date().toISOString(),
            },
        ],
        // Only the player can be pinged — never @everyone, roles, or anyone named in a comment.
        allowed_mentions: { parse: [], users: ping ? [ping] : [] },
    };

    const url = useBot
        ? `https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`
        : env.DISCORD_WEBHOOK_URL;
    const headers = { 'Content-Type': 'application/json' };
    if (useBot) headers.Authorization = `Bot ${env.DISCORD_BOT_TOKEN}`;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        if (!res.ok) console.error('Discord post failed', res.status, await res.text());
    } catch (e) {
        console.error('Discord post failed', e);
    }
}
