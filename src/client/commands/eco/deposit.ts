import { Command } from '@/structures/Command'

import { memberService } from '@/database/services/member'
import { EmbedUI } from '@/ui/EmbedUI'

import { formatCompactNumber } from '@/utils'

interface HandleDepositContext {
    userId: string;
    guildId: string;
    username: string;
    amountInput: string;
    reply: (data: any) => Promise<any>;
}

const handleDepositCommand = async ({
    userId,
    guildId,
    amountInput,
    reply,
}: HandleDepositContext) => {
    const member = await memberService.findOrCreate({
        userId,
        guildId
    }, {
        include: {
            vault: {
                select: {
                    capacityTier: true
                }
            }
        }
    });

    if (member.guildCoins <= 0) {
        return await reply({
            embeds: [
                EmbedUI.createErrorMessage(`Vous n'avez aucune pièce de serveur à déposer dans votre coffre-fort !`)
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

    try {
        const { deposited } = await memberService.depositGuildCoins({
            userId,
            guildId
        }, amountInput as number | 'all');


        return await reply({
            embeds: [
                EmbedUI.createMessage({
                    color: 'green',
                    title: '🏦 Dépôt effectué',
                    description: `Tu as déposé **${formatCompactNumber(deposited)}** pièces de serveur dans ton coffre-fort`,
                })
            ],
        });
    } catch (ex) {
        return await reply({
            embeds: [
                EmbedUI.createErrorMessage(`Tu ne peux pas mettre plus de pièces de serveur dans ton coffre-fort`)
            ],
        });
    }
};

export default new Command({
    description: '🔐⬅️ Deposit your server coins to the vault',
    nameLocalizations: {
        fr: 'déposer'
    },
    descriptionLocalizations: {
        fr: '🔐⬅️ Déposer ses pièces de serveur dans le coffre-fort'
    },
    slashCommand: {
        arguments: [
            {
                type: 3,
                name: 'amount',
                description: 'The amount to deposit or " all "',
                description_localizations: {
                    fr: 'Le montant à déposer ou " all "'
                },
                required: true,
            }
        ]
    },
    access: {
        guild: {
            modules: {
                eco: true
            }
        }
    },
    messageCommand: {
        style: 'flat',
        aliases: ['deposit', 'dep'],
    },
    async onInteraction(interaction) {
        const amountInput = interaction.options.getString('amount', true);

        return await handleDepositCommand({
            userId: interaction.user.id,
            guildId: interaction.guild!.id,
            username: interaction.user.globalName ?? interaction.user.username,
            amountInput,
            reply: (data) => interaction.reply(data)
        });
    },
    async onMessage(message, { args }) {
        const amountInput = args[0];

        if (!amountInput) {
            return message.reply({
                embeds: [
                    EmbedUI.createMessage({
                        color: 'red',
                        title: '❌ Utilisation incorrecte',
                        description: 'Exemple : `v!deposit 100` ou `v!deposit all`'
                    })
                ]
            });
        }

        return await handleDepositCommand({
            userId: message.author.id,
            guildId: message.guild!.id,
            username: message.author.globalName ?? message.author.username,
            amountInput,
            reply: (data) => message.reply(data)
        });
    }
});