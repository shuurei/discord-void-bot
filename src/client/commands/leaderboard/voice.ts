import { Command } from '@/structures/Command'
import { GuildMember } from 'discord.js'

import db from '@/database/db'

import { EmbedUI } from '@/ui/EmbedUI'

import { escapeAllMarkdown, getDominantColor } from '@/utils'
import { applicationEmojiHelper, guildMemberHelperSync } from '@/helpers'

const buildEmbed = async (member: GuildMember) => {
    const userId = member.user.id;
    const guild = member.guild;

    const rankers = (await db.member.findMany({
        where: {
            guildId: guild.id,
            OR: [
                { callActiveMinutes: { gt: 0 } },
                { callMutedMinutes: { gt: 0 } },
                { callDeafMinutes: { gt: 0 } },
            ]
        },
    })).map(({ callActiveMinutes, callMutedMinutes, callDeafMinutes, ...ranker }) => {
            return {
                ...ranker,
                voiceTotalMinutes: callActiveMinutes + callMutedMinutes + callDeafMinutes
            }
        }).sort((a, b) => b.voiceTotalMinutes - a.voiceTotalMinutes);

    if (!rankers.length) {
        return EmbedUI.createMessage('Aucune donnée', { color: 'orange' })
    };

    const topUserIds = rankers.slice(0, 10).map(r => r.userId);
    const topMembersMap = new Map(
        (await guild.members.fetch({ user: topUserIds }))
            .filter(m => m && !m.user.bot)
            .map(m => [m.user.id, m])
    );

    const { whiteArrowEmoji } = applicationEmojiHelper();
    const medals = ['🥇', '🥈', '🥉'];

    const top = rankers.slice(0, 10)
        .filter(r => topMembersMap.has(r.userId))
        .map((r,i) => {
            const memberObj = topMembersMap.get(r.userId)!;
            const memberHelper = guildMemberHelperSync(memberObj);
            const place = medals[i] ?? `**${i + 1}**`;
            const isAuthor = r.userId === userId;
            const name = memberHelper.getName()

            return `- ${place} ${isAuthor ? `**\`${name}\`**` : `\`${name}\``} ${whiteArrowEmoji} **${r.voiceTotalMinutes.toLocaleString('en')}** minutes en vocal`;
        }).join('\n');

    const leaderboardIndex = rankers.findIndex(r => r.userId === userId);
    const totalVocalMinutes = rankers.reduce((sum, r) => sum + r.voiceTotalMinutes, 0);

    const guildIcon = guild.iconURL();
    const guildIconDominantColor = guildIcon ? await getDominantColor(guildIcon) : undefined;

    const memberHelper = guildMemberHelperSync(member);

    return EmbedUI.create({
        title: `Classement des plus actif en vocal de ${escapeAllMarkdown(guild.name)}`,
        color: guildIconDominantColor,
        thumbnail: guildIcon ? { url: guildIcon } : undefined,
        description: [
            `> 🔊 **${totalVocalMinutes.toLocaleString('en')}** minutes de vocal cumulé sur le serveur`,
            topMembersMap.size < 10 ? `***TOP ${topMembersMap.size}***` : `***TOP 10 sur ${rankers.length.toLocaleString('en')} membres***`,
            top,
            leaderboardIndex >= 10 ? `- **..${leaderboardIndex + 1}** **\`${memberHelper.getName()}\`** ${whiteArrowEmoji} **${rankers[leaderboardIndex].voiceTotalMinutes.toLocaleString('en')}** minutes en vocal` : ''
        ].join('\n'),
        timestamp: Date.now()
    });
}

export default new Command({
    nameLocalizations: {
        fr: 'vocal'
    },
    description: "🏆 Shows the top members by time spent in voice chat",
    descriptionLocalizations: {
        fr: "🏆 Affiche le classement des meilleurs membres par temps passé en vocal"
    },
    messageCommand: {
        style: 'flat',
        aliases: [ 'topvoice', 'tvoice' ],
    },
    async onInteraction(interaction) {
        await interaction.deferReply();
        return await interaction.editReply({
            allowedMentions: {},
            embeds: [await buildEmbed(interaction.member)],
        });
    },
    async onMessage(message) {
        return await message.reply({
            allowedMentions: {},
            embeds: [await buildEmbed(message.member as GuildMember)],
        });
    }
});
