import { Command } from '@/structures/Command'

import { memberDailyQuestService } from '@/database/services/member-daily-quest'
import { guildModuleService, memberService } from '@/database/services'

import { applicationEmojiHelper, guildMemberHelper } from '@/helpers'
import { createActionRow, createButton } from '@/ui/components/common'
import { createProgressBar } from '@/ui/components'
import { EmbedUI } from '@/ui'

import { handleMemberCheckLevelUp } from '@/client/handlers/member-check-level-up'

import { formatTimeLeft, formatTimeLeftFromMinutes, getDominantColor, tzMap } from '@/utils'
import { DateTime } from 'luxon'

import { handleMemberDailyQuestSync } from '@/client/handlers/member-daily-quest-sync'
import { calculateQuestBonusMultiplier, MESSAGE_POOL, VOICE_POOL } from '@/utils/daily-quest'

export default new Command({
    nameLocalizations: {
        fr: 'quotidienne'
    },
    description: "🎯 View your daily quest",
    descriptionLocalizations: {
        fr: "🎯 Consulte ta quête quotidienne du jour"
    },
    access: {
        guild: {
            modules: {
                quest: true
            }
        }
    },
    async onInteraction(interaction) {
        const guild = interaction.guild;
        const guildId = guild.id;

        const [
            guildEcoModule,
            guildLevelModule,
            guildQuestModule,
        ] = await Promise.all([
            guildModuleService.findById({ moduleName: 'eco', guildId }),
            guildModuleService.findById({ moduleName: 'level', guildId }),
            guildModuleService.findById({ moduleName: 'quest', guildId }),
        ]);

        const isVoiceQuestEnabeld = guildQuestModule?.settings?.isVoiceQuestEnabeld;
        const isMessageQuestEnabled = guildQuestModule?.settings?.isMessageQuestEnabled;

        if (
            !(guildEcoModule?.isActive || guildLevelModule?.isActive)
            || !(isVoiceQuestEnabeld || isMessageQuestEnabled)
        ) {
            return await interaction.reply({
                embeds: [
                    EmbedUI.createErrorMessage({
                        title: '// Module désactivé',
                        description: `Un ou plusieurs modules requis sont désactivés par le gérant du serveur`
                    })
                ]
            });
        }

        const { whiteArrowEmoji } = applicationEmojiHelper();

        const member = interaction.member;
        const userId = member.user.id;

        const guildLocale = member.guild.preferredLocale;
        const guildTZ = tzMap[guildLocale] || 'UTC';

        const memberKey = { userId, guildId }

        const memberHelper = await guildMemberHelper(member, { fetchAll: true });
        const memberAvatarDominantColor = await getDominantColor(memberHelper.getAvatarURL({ forceStatic: true }));

        let questDatabase = await handleMemberDailyQuestSync(memberKey, guildLocale);

        const nowInGuildTZ = DateTime.now().setZone(guildTZ);

        const midnightInGuildTZ = nowInGuildTZ.endOf('day');

        const quest = {
            voice: VOICE_POOL.find((f) => f.value === questDatabase?.voiceMinutesTarget),
            message: MESSAGE_POOL.find((f) => f.value === questDatabase?.messagesSentTarget),
        }

        const bonusMultiplier = calculateQuestBonusMultiplier(quest);

        const fields = [];

        if (isVoiceQuestEnabeld && quest.voice) {
            fields.push({
                name: `🔊 Vocal`,
                value: [
                    `**${formatTimeLeftFromMinutes(questDatabase.voiceMinutesProgress)}** / **${formatTimeLeftFromMinutes(quest.voice.value)}**`,
                    createProgressBar(Math.max(0, questDatabase.voiceMinutesProgress / quest.voice.value), { length: 7, asciiChar: true, showPercentage: true }),
                ].join('\n'),
                inline: true
            });
        }

        if (isMessageQuestEnabled && quest.message) {
            fields.push({
                name: `💬 Messages`,
                value: [
                    `**${questDatabase.messagesSentProgress}** / **${quest.message.value}** envoyés`,
                    createProgressBar(Math.max(0, questDatabase.messagesSentProgress / quest.message.value), { length: 7, asciiChar: true, showPercentage: true }),
                ].join('\n'),
                inline: true
            });
        }

        if (!isMessageQuestEnabled) {
            quest.message = {} as any
            quest.message!.rewards = {
                activityXp: 0,
                guildCoins: 0
            }
        }

        if (!isVoiceQuestEnabeld) {
            quest.voice = {} as any
            quest.voice!.rewards = {
                activityXp: 0,
                guildCoins: 0
            }
        }

        const guildCoinsReward = Math.floor((quest.message?.rewards.guildCoins ?? 0) + (quest.voice?.rewards.guildCoins ?? 0) * bonusMultiplier);
        const activityXpReward = Math.floor((quest.message?.rewards.activityXp ?? 0) + (quest.voice?.rewards.activityXp ?? 0) * bonusMultiplier);

        fields.push({
            name: 'Récompenses',
            value: [
                guildEcoModule?.isActive && `- :coin: Pièces de serveur ${whiteArrowEmoji} **${guildCoinsReward.toLocaleString('en')}**`,
                guildLevelModule?.isActive && `- 🧪 XP ${whiteArrowEmoji} **${activityXpReward.toLocaleString('en')}**`
            ].filter(Boolean).join('\n')
        });

        const isCompleted = (quest.voice ? questDatabase.voiceMinutesProgress === quest.voice.value : true)
            && (quest.message ? questDatabase.messagesSentProgress === quest.message.value : true);

        const payload = {
            color: memberAvatarDominantColor,
            thumbnail: { url: memberHelper.getAvatarURL() },
            title: 'Quête quotidienne 🎯',
            description: [
                `> 💡 Complétez **tous les objectifs à 100%** pour réclamer la récompense, la quête se réinitialise chaque jour à minuit`,
                `- ⏳ Temps avant réinitialisation ${whiteArrowEmoji} **${formatTimeLeft(midnightInGuildTZ.toMillis(), nowInGuildTZ.toMillis())}**`
            ].join('\n'),
            fields,
            footer: { text: interaction.guild.name },
            timestamp: Date.now()
        }

        const getClaimButton = () => questDatabase?.isClaimed
            ? createButton('Déjà récupéré', {
                color: 'red',
                customId: '#claimed',
                disabled: true
            }) : createButton('Récupérer', {
                color: 'green',
                customId: 'claim',
                disabled: !isCompleted
            });

        const msg = await interaction.reply({
            embeds: [
                EmbedUI.create(payload)
            ],
            components: [
                createActionRow([ getClaimButton() ])
            ]
        });

        if (questDatabase.isClaimed || !isCompleted) return;

        const collector = msg.createMessageComponentCollector({
            filter: (i) => i.user.id === userId,
            time: 30_000
        });

        collector.on('collect', async (i) => {
            questDatabase = await memberDailyQuestService.findOrCreate(memberKey);

            if (questDatabase?.isClaimed) {
                return await interaction.deleteReply();
            }

            questDatabase = await memberDailyQuestService.updateOrCreate(memberKey, { isClaimed: true });

            if (guildEcoModule?.isActive) {
                await memberService.addGuildCoins(memberKey, guildCoinsReward);
            }
            
            if (guildLevelModule?.isActive) {
                await handleMemberCheckLevelUp({
                    member,
                    channel: interaction.channel,
                    xpGain: activityXpReward
                });
            }

            await i.update({
                embeds: [
                    EmbedUI.create(payload)
                ],
                components: [
                    createActionRow([ getClaimButton() ])
                ]
            });

            collector.stop();
        });

        collector.on('end', async () => {
            if (!questDatabase.isClaimed) {
                return await interaction.deleteReply();
            }
        });
    }
});
