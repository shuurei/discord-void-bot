import { Command } from '@/structures/Command'

import { memberVaultService } from '@/database/services'
import { EmbedUI } from '@/ui/EmbedUI'

interface HandleWithdrawContext {
    userId: string;
    guildId: string;
    username: string;
    amountInput: string;
    reply: (data: any) => Promise<any>;
}

const handleWithdrawCommand = async ({
    userId,
    guildId,
    amountInput,
    reply
}: HandleWithdrawContext) => {
    const memberVault = await memberVaultService.findOrCreate({
        userId,
        guildId
    });
    
    if (memberVault.guildCoins <= 0) {
        return await reply({
            embeds: [
                EmbedUI.createErrorMessage(`Vous n'avez aucun pièces de serveur à retirer du coffre-fort !`)
            ]
        });
    }

    if (amountInput !== 'all' && isNaN(+amountInput) || +amountInput <= 0) {
        return reply({
            embeds: [
                EmbedUI.createErrorMessage(`Montant invalide`)
            ],
        });
    }

    const { withdrawn } = await memberVaultService.withdrawGuildCoins({
        userId,
        guildId
    }, amountInput as number | 'all');

    return reply({
        embeds: [
            EmbedUI.createMessage({
                color: 'green',
                title: '🏧 Retrait effectué',
                description: `Tu as retiré **${withdrawn}** pièces de serveur vers ta poche !`,
            })
        ]
    });
};

export default new Command({
    description: '🔐⬅➡️ Withdraw your server coins from the vault',
    nameLocalizations: {
        fr: 'retirer'
    },
    descriptionLocalizations: {
        fr: '🔐➡️ Retirer ses pièces de serveur du coffre-fort'
    },
    slashCommand: {
        arguments: [
            {
                type: 3,
                name: 'amount',
                description: 'The amount to withdraw or " all "',
                description_localizations: {
                    fr: 'Le montant à retirer ou " all "'
                },
                required: true,
            }
        ],
    },
    messageCommand: {
        style: 'flat',
        aliases: ['withdraw', 'r'],
    },
    access: {
        guild: {
            modules: {
                eco: true
            }
        }
    },
    async onInteraction(interaction) {
        const amountInput = interaction.options.getString('amount', true);

        return handleWithdrawCommand({
            userId: interaction.user.id,
            guildId: interaction.guild!.id,
            username: interaction.user.globalName ?? interaction.user.username,
            amountInput,
            reply: (data) => interaction.reply(data)
        });
    },
    async onMessage(message, { args: [amountInput] }) {
        if (!amountInput) {
            return message.reply({
                embeds: [
                    EmbedUI.createMessage({
                        color: 'red',
                        title: '❌ Utilisation incorrecte',
                        description: `Exemple : \`${process.env.PREFIX}!withdraw 250\` ou \`${process.env.PREFIX}!withdraw all\``
                    })
                ]
            });
        }

        return handleWithdrawCommand({
            userId: message.author.id,
            guildId: message.guild!.id,
            username: message.author.globalName ?? message.author.username,
            amountInput,
            reply: (data) => message.reply(data)
        });
    }
});
