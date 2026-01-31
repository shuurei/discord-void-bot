import { Command } from '@/structures'
import { ApplicationCommandOptionType } from 'discord.js'

import { waifuAPI } from '@/api'
import { EmbedUI } from '@/ui/EmbedUI'

export default new Command({
    description: '👊 slap someone',
    nameLocalizations: {
        fr: 'frapper'
    },
    descriptionLocalizations: {
        fr: "👊 frapper quelqu'un"
    },
    slashCommand: {
        arguments: [
            {
                type: ApplicationCommandOptionType.User,
                name: 'user',
                description: 'The user you want to slap',
                name_localizations: {
                    fr: 'utilisateur'
                },
                description_localizations: {
                    fr: 'La personne à qui mettre une baffe'
                },
                required: true
            },
        ]
    },
    async onInteraction(interaction) {
        const hasUser = interaction.options.getUser('user');
        const target = hasUser ?? interaction.guild?.members.cache.filter((member) => !member.user.bot).random();

        const sentence = `${interaction.user} viens de frapper ${target} 👊`;

        return await interaction.reply({
            content: hasUser ? sentence : undefined,
            embeds: [
                EmbedUI.createMessage({
                    color: 'purple',
                    description: hasUser ? undefined : sentence,
                    image: {
                        url: await waifuAPI('slap')
                    }
                })
            ]
        })
    }
})