import { Event } from '@/structures'
import {
    BaseMessageOptions,
    ChatInputCommandInteraction,
    Message,
    Team
} from 'discord.js'

import db from '@/database/db'
import { guildModuleService } from '@/database/services'
import {
    GuildModuleKeys,
    GuildModuleName,
    PrismaUserFlags
} from '@/database/utils'

import { logger } from '@/utils'
import { createNotifCard } from '@/ui/assets/cards/notifCard'

const replyBy = async (interaction: Message | ChatInputCommandInteraction, payload: BaseMessageOptions) => {
    try {
        if (interaction instanceof ChatInputCommandInteraction) {
            return await interaction[interaction.deferred ? 'editReply' : 'reply'](payload);
        } else if (interaction instanceof Message && interaction.channel.isSendable()) {
            return await interaction.reply(payload);
        }
    } catch (ex) {
        logger.error(ex);
    }
}

export default new Event({
    name: 'commandCreate',
    async run({ events: [command, interaction, args] }) {
        const replyAuthorizationRefused = async (content: string[] | string) => {
            if (!Array.isArray(content)) {
                content = [content];
            }

            return await replyBy(interaction, {
                files: [
                    {
                        attachment: await createNotifCard({
                            text: `[${content}]`,
                            fontSize: 24,
                            theme: 'red'
                        }),
                        name: 'unauthorizedCard.png'
                    }
                ]
            });
        }

        try {
            const access = command.access ?? null;
            const guild = interaction.guild;
            const user = interaction instanceof Message
                ? interaction.author
                : interaction.user;

            const memberPermissions = interaction instanceof Message
                ? interaction.member?.permissions
                : interaction.memberPermissions;

            if (!(guild && user)) {
                throw new Error('No guild or no user')
            };

            const userDatabase = await db.user.findUnique({
                where: {
                    id: user.id
                }
            });

            if (!this.client.application?.owner) {
                await this.client.application?.fetch();
            }

            const isDeveloper = (this.client.application!.owner as Team).members.has(user.id);

            if (access) {
                if (access.guild) {
                    if (access.guild.modules) {
                        const moduleNames = Object.keys(access.guild.modules) as GuildModuleName[];
                        const areModulesEnabled = await guildModuleService.areEnabled(guild.id, moduleNames, 'every');
                        if (!areModulesEnabled) {
                            return await replyAuthorizationRefused(
                                'Contexte invalide. Un ou plusieurs modules requis sont désactivés par le gérant du serveur.',
                            );
                        }

                        for (const moduleName of moduleNames) {
                            const moduleFields = Object.keys(access.guild.modules[moduleName] as any) as GuildModuleKeys<typeof moduleName>[];

                            if (moduleFields.length === 0) continue;

                            const areFieldsEnabled = await guildModuleService.areSettingFieldEnabled(
                                guild.id,
                                moduleName,
                                moduleFields,
                                'every'
                            );

                            if (!areFieldsEnabled) {
                                return await replyAuthorizationRefused(
                                    `Contexte invalide. Une ou plusieurs options lié à un module requis sont désactivés.`,
                                );
                            }
                        }
                    }
                }

                if (access.channel) {
                    if (
                        access.channel?.isNSFW && interaction.channel?.isTextBased()
                        && 'nsfw' in interaction.channel
                        && !interaction.channel.nsfw
                    ) {
                        return await replyAuthorizationRefused(`Contexte invalide. Salon NSFW requis.`);
                    }
                }

                if (access.user) {
                    if (access.user?.isDeveloper && !isDeveloper) {
                        return await replyAuthorizationRefused(`Autorisation insuffisante. Accès développeur requis.`);
                    }

                    if (userDatabase && !isDeveloper) {
                        if (access.user?.isStaff && !userDatabase.flags.has(PrismaUserFlags.STAFF)) {
                            return await replyAuthorizationRefused(`Accès restreint. Probabilité de succès insuffisante.`);
                        }

                        if (access.user?.isBetaTester && !userDatabase.flags.has(PrismaUserFlags.BETA)) {
                            return await replyAuthorizationRefused(`Accès restreint. Statut bêta requis.`);
                        }
                    }

                    if (access.user?.isGuildOwner && user.id !== guild.ownerId) {
                        return await replyAuthorizationRefused(`Vous n’êtes pas le propriétaire de cette serveur`);
                    }

                    if (access.user?.requiredPermissions && !memberPermissions?.has(access.user.requiredPermissions)) {
                        return await replyAuthorizationRefused(`Permissions insuffisantes.`);
                    }
                }
            }

            if (
                interaction instanceof ChatInputCommandInteraction
                && command.onInteraction
                && interaction.inCachedGuild()
            ) {
                return await command.onInteraction(interaction);
            } else if (
                interaction instanceof Message
                && command.onMessage
                && interaction.inGuild()
            ) {
                return await command.onMessage(interaction, { args });
            }
        } catch (err) {
            this.client.logger.error(err);

            return await replyBy(interaction, {
                files: [
                    {
                        attachment: await createNotifCard({
                            text: '[Une anomalie a été détectée.]',
                            theme: 'red'
                        }),
                        name: 'errorCard.png'
                    }
                ]
            });
        }
    }
});