import { Command } from '@/structures/Command'
import { GuildMember } from 'discord.js'

import db from '@/database/db'

import { EmbedUI } from '@/ui/EmbedUI'

import { escapeAllMarkdown, getDominantColor } from '@/utils'
import { guildMemberHelperSync } from '@/helpers'

const buildEmbed = async (member: GuildMember) => {
    const userId = member.user.id;
    const guild = member.guild;

    const rankers = (await db.member.findMany({
        where: { guildId: guild.id, activityXp: { gt: 0 } }
    })).sort((a, b) => b.activityXp - a.activityXp);

    if (!rankers.length) return EmbedUI.createMessage('Aucune donnée', { color: 'orange' });

    const topUserIds = rankers.slice(0, 10).map(r => r.userId);
    const topMembersMap = new Map(
        (await guild.members.fetch({ user: topUserIds }))
            .filter(m => m && !m.user.bot)
            .map(m => [m.user.id, m])
    );

    const medals = ['🥇', '🥈', '🥉'];

    const top = rankers.slice(0, 10)
        .filter(r => topMembersMap.has(r.userId))
        .map((r, i) => {
            const memberObj = topMembersMap.get(r.userId)!;
            const memberHelper = guildMemberHelperSync(memberObj);
            const place = medals[i] ?? `**${i + 1}**`;
            const isAuthor = r.userId === userId;
            const name = memberHelper.getName();

            return [
                `- ${place} ${isAuthor ? `**\`${name}\`**` : `\`${name}\``}`,
                `**↳** Nv. **${r.activityLevel}**`,
                `**↳** **${r.activityXp.toLocaleString('en')}** XP`
            ].join('\n');
        }).join('\n');

    const leaderboardIndex = rankers.findIndex(r => r.userId === userId);
    const totalLevels = rankers.reduce((sum, r) => sum + r.activityLevel, 0);

    const guildIcon = guild.iconURL();
    const guildIconDominantColor = guildIcon ? await getDominantColor(guildIcon) : undefined;

    const memberHelper = guildMemberHelperSync(member);

    return EmbedUI.create({
        title: `Classement des niveaux de ${escapeAllMarkdown(guild.name)}`,
        color: guildIconDominantColor,
        thumbnail: guildIcon ? { url: guildIcon } : undefined,
        description: [
            `> 🧠 **${totalLevels.toLocaleString('en')}** niveaux cumulés sur le serveur`,
            topMembersMap.size < 10 ? `***TOP ${topMembersMap.size}***` : `***TOP 10 sur ${rankers.length.toLocaleString('en')} membres***`,
            top,
            leaderboardIndex >= 10 ? [
                `- **..${leaderboardIndex + 1} \`${memberHelper.getName()}**\``,
                `**↳** Nv. **${rankers[leaderboardIndex].activityLevel}**`,
                `**↳** **${rankers[leaderboardIndex].activityXp.toLocaleString('en')}** XP`
            ].join('\n') : ''
        ].join('\n'),
        timestamp: Date.now()
    });
}

export default new Command({
    nameLocalizations: {
        fr: 'niveaux'
    },
    description: "🏆 Shows the top members by level",
    descriptionLocalizations: {
        fr: "🏆 Affiche le classement des meilleurs membres par niveau"
    },
    access: {
        guild: {
            modules: {
                level: true
            }
        }
    },
    messageCommand: {
        style: 'flat',
        aliases: [
            'toplevel',
            'tlevel',
            'tlvl'
        ],
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
