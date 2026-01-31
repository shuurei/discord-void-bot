import { Event } from '@/structures'
import { MessageFlags, User } from 'discord.js'

import { ContainerUI } from '@/ui'
import {
    createActionRow,
    createButton,
    createSection,
    createSeparator,
    createTextDisplay,
    createThumbnail
} from '@/ui/components/common'

import { escapeAllMarkdown, getDominantColor } from '@/utils'
import { blacklistService } from '@/database/services'

export default new Event({
    name: 'blacklistCreate',
    async run({ events: [blacklist, fromGuild, target, author] }) {
        const ticketChannel = this.client.hub?.ticketChannel
        if (!ticketChannel) return

        const buildProfile = (user: User) => {
            const createdAt = Math.floor(user.createdTimestamp / 1000);

            return [
                createSection({
                    accessory: createThumbnail({
                        url: user.displayAvatarURL()
                    }),
                    components: [
                        createTextDisplay(`### ${user.globalName ?? user.displayName}`),
                        createTextDisplay([
                            `**Identifiant**`,
                            `- **\`${user.id}\`**`,
                            `**Nom d'utilisateur**`,
                            `- **\`${user.username}\`**`,
                            `**Création du compte**`,
                            `- <t:${createdAt}>`,
                            `- <t:${createdAt}:R>`
                        ].join('\n'))
                    ]
                })
            ]
        }

        const guildCreatedAt = Math.floor(fromGuild.createdTimestamp / 1000);
        const guildIconURL = fromGuild.iconURL();

        const guildInfoComponents = [
            createTextDisplay(`### ${escapeAllMarkdown(fromGuild.name)}`),
            createTextDisplay([
                `**Description**`,
                `> ${fromGuild.description ?? '*Aucune*'}`
            ].join('\n')),
            createTextDisplay([
                `**Identifiant**`,
                `- **\`${fromGuild.id}\`**`,
                `**Création du serveur**`,
                `- <t:${guildCreatedAt}>`,
                `- <t:${guildCreatedAt}:R>`
            ].join('\n'))
        ];

        const thread = await ticketChannel.threads.create({
            name: `${target.username} - #${ticketChannel.threads.cache.size + 1}`,
            message: {
                flags: MessageFlags.IsComponentsV2,
                components: [
                    ContainerUI.create({
                        color: guildIconURL ? await getDominantColor(guildIconURL) : undefined,
                        components: [
                            createTextDisplay(`## 🧭 Information du serveur`),
                            createSeparator(),
                            ...guildIconURL
                                ? [
                                    createSection({
                                        accessory: createThumbnail({
                                            url: guildIconURL
                                        }),
                                        components: guildInfoComponents
                                    })
                                ] : guildInfoComponents
                        ]
                    }),
                    ContainerUI.create({
                        color: await getDominantColor(target.displayAvatarURL()),
                        components: [
                            createTextDisplay(`## 👤 Information de l'accusé`),
                            createSeparator(),
                            ...buildProfile(target),
                        ]
                    }),
                    ContainerUI.create({
                        color: await getDominantColor(author.displayAvatarURL()),
                        components: [
                            createTextDisplay(`## 🛡️ Information de l'auteur`),
                            createSeparator(),
                            ...buildProfile(author),
                        ]
                    }),
                    ContainerUI.create({
                        color: 'orange',
                        components: [
                            createTextDisplay(`## 💭 Informations`),
                            createSeparator(),
                            createTextDisplay([
                                `🧩 **Contexte**`,
                                `> ${blacklist.context ?? "Aucun Context spécifié"}`
                            ].join('\n')),
                            createTextDisplay([
                                `⚠️ **Raison**`,
                                `> ${blacklist.reason ?? "Aucune raison spécifiée"}`
                            ].join('\n')),
                            createSeparator(),
                            createTextDisplay(`**État du ticket**`),
                            createActionRow([
                                createButton('Claim', { color: 'blue', customId: `claim_ticket` }),
                                createButton('Traiter', { color: 'green', customId: `treat_ticket`, disabled: true }),
                                createButton('Fermer', { color: 'red', customId: `close_ticket`, disabled: true }),
                            ]),
                            createSeparator(),
                            createActionRow([
                                createButton('Rejoindre le serveur', {
                                    color: 'gray',
                                    customId: 'invite_ticket',
                                    disabled: true
                                }),
                            ]),
                        ]
                    })
                ]
            },
        });

        await blacklistService.update(target.id, {
            threadId: thread.id
        });
    }
})
