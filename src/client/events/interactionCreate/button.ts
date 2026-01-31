import { Event } from '@/structures'

import {
    APIButtonComponentWithCustomId,
    APIContainerComponent,
    ComponentType,
    MessageFlags
} from 'discord.js'

import { BlacklistStatus } from '@/database/core/enums'
import { blacklistDerogationService, blacklistService } from '@/database/services'

import { hubConfig } from '@/client/config/hub'
import { ContainerUI, EmbedUI } from '@/ui'

import { applicationEmojiHelper } from '@/helpers'
import { createNotifCard } from '@/ui/assets/cards/notifCard'
import { createMediaGallery } from '@/ui/components/common'

export default new Event({
    name: 'buttonInteractionCreate',
    async run({ events: [interaction] }) {
        const { greenArrowEmoji } = applicationEmojiHelper();

        const user = interaction.user;
        const guild = interaction.guild;
        const message = interaction.message;
        const channel = interaction.channel;

        // Hub Ticket
        if (channel?.isThread() && channel.parent?.id === hubConfig.ticketChannelId) {
            const blacklist = await blacklistService.findByThreadId(channel.id);

            if (!blacklist) {
                return await interaction.reply({
                    flags: MessageFlags.Ephemeral,
                    content: '[Une erreur est survenue.]'
                });
            }

            const guild = this.client.guilds.cache.get(blacklist.guildId);

            let components = message.components.map((component) => component.toJSON());
            let infoContainer = components[components.length - (components.length > 4 ? 2 : 1)] as APIContainerComponent;
            let stateButtons = infoContainer.components.find((component) => component.type === ComponentType.ActionRow)?.components as APIButtonComponentWithCustomId[];
            let actionButtons = infoContainer.components.findLast((component) => component.type === ComponentType.ActionRow)?.components as APIButtonComponentWithCustomId[];

            let claimButton = stateButtons?.find((button) => button.custom_id == 'claim_ticket');
            let treatButton = stateButtons?.find((button) => button.custom_id == 'treat_ticket');
            let closeButton = stateButtons?.find((button) => button.custom_id == 'close_ticket');
            let joinServerButton = actionButtons?.find((button) => button.custom_id == 'invite_ticket');

            if (!(
                claimButton
                && treatButton
                && closeButton
                && joinServerButton
            )) return;

            switch (interaction.customId) {
                case 'claim_ticket': {
                    await Promise.all([
                        channel.setAppliedTags(['1466532762579108059']),
                        blacklistService.update(blacklist.targetId, {
                            cleanerId: user.id,
                            status: BlacklistStatus.CLAIMED
                        })
                    ]);

                    treatButton.disabled = false;
                    closeButton.disabled = false;
                    joinServerButton.disabled = false;
                    claimButton.disabled = true;

                    components.push(
                        ContainerUI.createSuccessMessage({
                            message: `Nettoyeur en charge ${greenArrowEmoji} ${interaction.user}`
                        })
                    );

                    return await interaction.update({ components });
                }

                case 'treat_ticket': {
                    await Promise.all([
                        channel.setAppliedTags(['1466532812076093590']),
                        blacklistService.update(blacklist.targetId, {
                            blacklistedAt: new Date(),
                            status: BlacklistStatus.TREATED
                        })
                    ]);

                    treatButton.disabled = true;
                    closeButton.disabled = true;
                    joinServerButton.disabled = true;
                    claimButton.disabled = true;

                    this.client.emit('blacklistTreated', blacklist);

                    return await interaction.update({ components });
                }

                case 'close_ticket': {
                    await Promise.all([
                        channel.setAppliedTags(['1466532905504477428']),
                        blacklistService.updateState(blacklist.targetId, BlacklistStatus.CLOSED)
                    ]);

                    treatButton.disabled = true;
                    closeButton.disabled = true;
                    joinServerButton.disabled = true;
                    claimButton.disabled = true;

                    return await interaction.update({ components });
                }

                case 'invite_ticket': {
                    if (!guild) {
                        return await interaction.reply({
                            embeds: [
                                EmbedUI.createErrorMessage(`Je n'ai pas réussi à générer une invitation pour ce serveur`)
                            ]
                        });
                    }

                    const channelForInvite = guild.rulesChannel ?? guild.channels.cache.find(
                        (c) => !c.isVoiceBased() && c.permissionsFor(guild.roles.everyone).has('ViewChannel')
                    );

                    if (!channelForInvite) {
                        return await interaction.reply({
                            embeds: [
                                EmbedUI.createErrorMessage(`Aucun salon accessible n'a été trouvé pour générer une invitation`)
                            ]
                        });
                    }

                    const invite = await guild.invites.create(channelForInvite.id, {
                        unique: true,
                        maxUses: 1,
                        maxAge: 300,
                        temporary: true
                    });

                    return await interaction.reply({
                        flags: MessageFlags.Ephemeral,
                        content: `discord.gg/${invite.code}`
                    });
                }
            }
        }

        if (guild && interaction.customId.includes('derogation')) {
            const userId = interaction.customId.split('.').pop() as string;
            const isBan = await guild.bans.fetch({ user: userId, force: true }).catch(() => null);

            if (interaction.customId.startsWith('authorize_')) {
                await blacklistDerogationService.authorize({
                    guildId: guild.id,
                    userId,
                });

                if (isBan) {
                    await guild.bans.remove(userId, `Dérogation de ${interaction.user.username}`);
                }

                return await interaction.update({
                    flags: MessageFlags.IsComponentsV2,
                    files: [{
                        attachment: await createNotifCard({
                            text: `[Dérogation accordée.]`,
                            theme: 'green'
                        }),
                        name: 'success.png'
                    }],
                    components: [
                        createMediaGallery([{ media: { url: 'attachment://success.png' } }]),
                    ]
                });
            } else if (interaction.customId.startsWith('refused_')) {
                const derogation = await blacklistDerogationService.unauthorize({
                    userId,
                    guildId: guild.id,
                });

                if (!isBan) {
                    await guild.bans.create(userId, {
                        reason: derogation?.blacklist?.reason ?? 'Aucune raison spécifiée'
                    });
                }

                return await interaction.update({
                    flags: MessageFlags.IsComponentsV2,
                    files: [{
                        attachment: await createNotifCard({
                            text: `[Dérogation refusé.]`,
                            theme: 'green'
                        }),
                        name: 'success.png'
                    }],
                    components: [
                        createMediaGallery([{ media: { url: 'attachment://success.png' } }]),
                    ]
                });
            }
        }
    }
});
