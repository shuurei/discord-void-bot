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

import { EmbedUI } from '@/ui/EmbedUI'
import { logger } from '@/utils'

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
        const replyAuthorizationRefused = async (content: string[] | string, title?: string) => {
            if (!Array.isArray(content)) {
                content = [content];
            }

            return await replyBy(interaction, {
                embeds: [
                    EmbedUI.createMessage({
                        color: 'red',
                        title: `// ${title ?? "Authorization refusée"}`,
                        description: content.join('\n'),
                    })
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
                                'Un ou plusieurs modules requis sont désactivés par le gérant du serveur',
                                'Module désactivé'
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
                                    `Une ou plusieurs options lié à un module requis sont désactivés par le gérant du serveur`,
                                    'Option de module désactivé'
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
                        return await replyAuthorizationRefused(`Cette commande ne peut être utilisée que dans les salons NSFW`);
                    }
                }

                if (access.user) {
                    if (access.user?.isDeveloper && !isDeveloper) {
                        return await replyAuthorizationRefused(`Cette commande est accessible uniquement au développeur`);
                    }

                    if (userDatabase && !isDeveloper) {
                        if (access.user?.isStaff && !userDatabase.flags.has(PrismaUserFlags.STAFF)) {
                            return await replyAuthorizationRefused(`Cette commande est accessible uniquement aux personnes staff du bot`);
                        }

                        if (access.user?.isBetaTester && !userDatabase.flags.has(PrismaUserFlags.BETA)) {
                            return await replyAuthorizationRefused(`Cette commande est accessible uniquement aux bêta-testeurs`);
                        }
                    }

                    if (access.user?.isGuildOwner && user.id !== guild.ownerId) {
                        return await replyAuthorizationRefused(`Vous n’êtes pas le propriétaire de cette communauté`);
                    }

                    if (access.user?.requiredPermissions && !memberPermissions?.has(access.user.requiredPermissions)) {
                        return await replyAuthorizationRefused(`Vous n'avez pas les permissions nécessaire`);
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
                files: ['https://i.pinimg.com/originals/89/9b/5a/899b5a60f74635cc686a794551e3238d.gif']
            });
        }
    }
});