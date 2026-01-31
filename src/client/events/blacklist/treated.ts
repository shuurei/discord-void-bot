import { Event } from '@/structures'
import { MessageFlags } from 'discord.js'

import { ContainerUI } from '@/ui'
import { createNotifCard } from '@/ui/assets/cards/notifCard'
import {
    createMediaGallery,
    createSection,
    createSeparator,
    createTextDisplay,
    createThumbnail
} from '@/ui/components/common'

import { getDominantColor } from '@/utils'

export default new Event({
    name: 'blacklistTreated',
    async run({ events: [blacklist] }) {
        const guilds = await Promise.all(
            (await this.client.guilds.fetch()).map((guild) => guild.fetch())
        );

        for (const guild of guilds) {
            const safetyChannel = guild.safetyAlertsChannel;
            if (!safetyChannel) continue;

            const member = await guild.members.fetch(blacklist.targetId).catch(() => { });
            if (!member) continue;
        
            const memberAvatarURL = member.displayAvatarURL();
            const memberAvatarDominantColor = await getDominantColor(memberAvatarURL);

            await safetyChannel.send({
                flags: MessageFlags.IsComponentsV2,
                files: [{
                    attachment: await createNotifCard({
                        text: `[Liste noire mise à jour.]`
                    }),
                    name: 'info.png'
                }],
                components: [
                    createMediaGallery([{ media: { url: `attachment://info.png` } }]),
                    ContainerUI.create({
                        color: memberAvatarDominantColor,
                        components: [
                            createTextDisplay(`## Utilisateur mis sur liste noire 🥀`),
                            createSeparator(),
                            createSection({
                                accessory: createThumbnail({
                                    url: memberAvatarURL
                                }),
                                components: [
                                    createTextDisplay(`## ${member} \`(${member.user.globalName ?? member.user.displayName}・${member.id})\``),
                                    createTextDisplay(`> ${blacklist.reason ?? 'Aucune raison spécifiée'}`)
                                ]
                            })
                        ]
                    })
                ],
            });
        }
    }
});
