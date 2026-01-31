import { Command } from '@/structures/Command'
import {
    ApplicationCommandOptionType,
    InteractionReplyOptions,
    MessageEditOptions,
    MessageFlags
} from 'discord.js'

import { BlacklistStatus } from '@/database/core/enums'
import { blacklistDerogationService, blacklistService } from '@/database/services'

import { ContainerUI } from '@/ui'
import {
    createActionRow,
    createButton,
    createSection,
    createSeparator,
    createTextDisplay,
    createThumbnail
} from '@/ui/components/common'
import { createNotifCard } from '@/ui/assets/cards/notifCard'

import { applicationEmojiHelper } from '@/helpers'
import { getDominantColor } from '@/utils'

export default new Command({
    description: `🔎 Check blacklist info for a user`,
    descriptionLocalizations: {
        fr: `🔎 Vérifie les informations de blacklist d'un utilisateur`
    },
    access: {
        user: {
            requiredPermissions: ['BanMembers']
        }
    },
    slashCommand: {
        arguments: [
            {
                type: ApplicationCommandOptionType.User,
                name: 'user',
                description: 'The user to check blacklist info',
                name_localizations: {
                    fr: 'utilisateur'
                },
                description_localizations: {
                    fr: "L'utilisateur dont vous voulez vérifier la blacklist"
                },
                required: true
            },
        ]
    },
    async onInteraction(interaction) {
        const { yellowArrowEmoji, greenArrowEmoji, redArrowEmoji } = applicationEmojiHelper();

        const user = interaction.options.getUser('user');

        if (!user) {
            return await interaction.reply({
                files: [{
                    attachment: await createNotifCard({
                        text: `[Utilisateur introuvable.]`
                    })
                }]
            })
        }

        const userId = user.id;
        const guildId = interaction.guild.id;

        const [
            blacklist,
            banInfo
        ] = await Promise.all([
            blacklistService.findById(userId),
            interaction.guild.bans.fetch({ user: userId, force: true }).catch(() => {})
        ]);

        let derogation = await blacklistDerogationService.findById({ guildId, userId });

        const memberAvatarURL = user.displayAvatarURL();
        const memberAvatarDominantColor = await getDominantColor(memberAvatarURL);

        const buildPayload = () => {
            const createDerogationButton = () => {
                return derogation?.authorized
                    ? createButton("Retirer l'autorisation", { color: 'red', customId: 'unauthorize' })
                    : createButton("Autoriser", { color: 'green', customId: 'authorize' });
            }

            const isPending = (blacklist?.status === BlacklistStatus.PENDING || blacklist?.status === BlacklistStatus.CLAIMED);
            const isTreated = blacklist?.status === BlacklistStatus.TREATED
            const createdAt = Math.floor(user.createdTimestamp / 1000);

            return {
                flags: MessageFlags.IsComponentsV2,
                components: [
                    ContainerUI.create({
                        color: memberAvatarDominantColor,
                        components: [
                            createSection({
                                accessory: createThumbnail({
                                    url: memberAvatarURL
                                }),
                                components: [
                                    createTextDisplay(`## ${user.globalName ?? user.displayName}`),
                                    createTextDisplay([
                                        `**Identifiant**`,
                                        `- **\`${userId}\`**`,
                                        `**Nom d'utilisateur**`,
                                        `- **\`${user.username}\`**`,
                                        `**Création du compte**`,
                                        `- <t:${createdAt}>`,
                                        `- <t:${createdAt}:R>`
                                    ].join('\n'))
                                ]
                            }),
                            createSeparator(),
                            createTextDisplay([
                                `- ${isPending ? '⏳' : isTreated ? '✅' : '❌'} ${isPending ? yellowArrowEmoji : blacklist ? greenArrowEmoji : redArrowEmoji} **Liste noire**`,
                                blacklist && `> ${blacklist.reason ?? 'Aucune raison spécifiée'}`,
                                isTreated && `-# ⌛ **Traité** <t:${Math.floor(blacklist.blacklistedAt.getTime() / 1000)}:R>`,
                            ].filter(Boolean).join('\n')),
                            blacklist?.status === 'TREATED' && createTextDisplay([
                                `- ${derogation?.authorized ? '✅' : '❌'} ${derogation?.authorized ? greenArrowEmoji : redArrowEmoji} **Dérogation**`,
                                derogation?.authorized && `-# ⌛ **Autorisé** <t:${Math.floor(derogation.decidedAt.getTime() / 1000)}:R>`,
                            ].filter(Boolean).join('\n')),
                            createTextDisplay([
                                `- ${banInfo ? '✅' : '❌'} ${banInfo ? greenArrowEmoji : redArrowEmoji} **Ban du serveur**`,
                                banInfo && `> ${banInfo.reason ?? 'Aucune raison spécifiée'}`,
                            ].filter(Boolean).join('\n')),
                            ...isTreated ? [
                                createSeparator(),
                                createActionRow([createDerogationButton()])
                            ] : []
                        ].filter(Boolean) as any
                    })
                ]
            } as InteractionReplyOptions & MessageEditOptions
        }

        const msg = await interaction.reply(buildPayload());

        if (blacklist) {
            const collector = msg.createMessageComponentCollector({
                filter: (i) => i.user.id === interaction.user.id,
                time: 30_000
            });

            collector.on('collect', async (i) => {
                if (i.customId === 'authorize') {
                    const isBan = interaction.guild?.bans.cache.get(userId);
                    if (isBan) {
                        await interaction.guild?.bans.remove(userId, `Dérogation de ${interaction.user.username}`);
                    }

                    derogation = await blacklistDerogationService.authorize({ userId, guildId }) as any;
                } else {
                    derogation = await blacklistDerogationService.unauthorize({ userId, guildId }) as any;
                }

                return await i.update(buildPayload());
            });

            collector.on('end', async () => {
                return await msg.delete().catch(() => { });
            });
        }
    }
})