import { Command } from '@/structures/Command'
import {
    ApplicationCommandOptionType,
    InteractionReplyOptions,
    InteractionResponse,
    Message,
    MessageFlags,
    MessageReplyOptions
} from 'discord.js'

import db from '@/database/db'
import { memberService } from '@/database/services/member'

import { createNotifCard } from '@/ui/assets/cards/notifCard'
import { createActionRow, createButton, createMediaGallery } from '@/ui/components/common'
import { parseUserMention } from '@/utils'

const handleCommand = async ({
    guildId,
    amount,
    fromUserId,
    toUserId,
    toUsername,
    reply
}: {
    guildId: string;
    amount: number | string | null;
    fromUserId: string;
    toUserId?: string | null;
    toUsername?: string | null;
    reply: (data: InteractionReplyOptions & MessageReplyOptions) => Promise<InteractionResponse | Message<true>>;
}) => {
    if (!(toUserId && toUsername)) {
        return await reply({
            files: [
                {
                    attachment: await createNotifCard({
                        text: "[Utilisateur introuvable.]",
                        theme: 'red'
                    }),
                    name: 'failure.png'
                }
            ]
        });
    }

    if (fromUserId === toUserId) {
        return await reply({
            files: [
                {
                    attachment: await createNotifCard({
                        text: "[Utilisateur invalide.]",
                        theme: 'red'
                    }),
                    name: 'failure.png'
                }
            ]
        });
    }

    if (!amount) {
        return await reply({
            files: [
                {
                    attachment: await createNotifCard({
                        text: "[Merci d'inscrire le montant.]",
                        theme: 'red'
                    }),
                    name: 'failure.png'
                }
            ]
        });
    }

    const balance = await memberService.getTotalGuildCoins({
        guildId,
        userId: fromUserId
    });

    if (typeof amount === 'string') {
        if (amount === 'all') {
            amount = Math.max(balance.total, 0);
        } else {
            amount = parseInt(amount);
        }
    }

    if (typeof amount === 'string' || isNaN(amount) || amount <= 0) {
        return await reply({
            files: [
                {
                    attachment: await createNotifCard({
                        text: "[Montant invalide.]",
                        theme: 'red'
                    }),
                    name: 'failure.png'
                }
            ]
        });
    }

    if (balance.total < amount) {
        return await reply({
            files: [
                {
                    attachment: await createNotifCard({
                        text: `[Vous n'avez pas assez d'argent pour faire un virement.]`,
                        theme: 'red',
                        fontSize: 24
                    }),
                    name: 'failure.png'
                }
            ]
        });
    }

    const msg = await reply({
        flags: MessageFlags.IsComponentsV2,
        files: [
            {
                attachment: await createNotifCard({
                    text: `[Voulez-vous vraiment faire un virement de ${amount.toLocaleString('en')} pièces à ${toUsername} ?]`,
                    theme: 'orange',
                    fontSize: 20
                }),
                name: 'question.png'
            }
        ],
        components: [
            createMediaGallery([{ media: { url: `attachment://question.png` } }]),
            createActionRow([
                createButton('Ouaip', { color: 'gray', customId: '#confirm' }),
                createButton('Nop', { color: 'gray', customId: '#cancel' })
            ])
        ]
    });

    try {
        const { customId: response } = await msg.awaitMessageComponent({
            filter: (i) => i.user.id === fromUserId,
            time: 30_000
        });

        if (response === '#cancel') {
            return await msg.edit({
                files: [
                    {
                        attachment: await createNotifCard({
                            text: `[Virement annulé.]`,
                        }),
                        name: 'info.png'
                    }
                ],
                components: []
            });
        }

        await db.$transaction(async (tx) => {
            const ctx = Object.create(memberService, {
                model: { value: tx.member }
            });

            await memberService.removeGuildCoinsWithVault.call(ctx, { guildId, userId: fromUserId }, amount);
            await memberService.addGuildCoins.call(ctx, { guildId, userId: toUserId }, amount);
        });

        const files = [
            {
                attachment: await createNotifCard({
                    text: `[Virement de ${amount} pièces réussi.]`,
                    theme: 'green',
                }),
                name: 'success.png'
            },
            {
                attachment: await createNotifCard({
                    text: `[Nouveau solde : ${(balance.total - amount).toLocaleString('en')}.]`,
                }),
                name: 'info.png'
            }
        ];

        await msg.edit({
            files,
            components: files.map((file) => {
                return createMediaGallery([{ media: { url: `attachment://${file.name}` } }])
            })
        });
    } catch {
        await msg.delete().catch(() => { });
    }
};

export default new Command({
    description: '💸 Send server coins to another user',
    nameLocalizations: {
        fr: 'virement'
    },
    descriptionLocalizations: {
        fr: '💸 Faire un virement des pièces du serveur à un autre joueur'
    },
    slashCommand: {
        arguments: [
            {
                type: ApplicationCommandOptionType.User,
                name: 'member',
                description: 'The member you want to pay',
                description_localizations: {
                    fr: 'Le membre à qui vous voulez faire le virement '
                },
                required: true
            },
            {
                type: ApplicationCommandOptionType.String,
                name: 'amount',
                description: 'The amount to pay or " all "',
                description_localizations: {
                    fr: 'Le montant du virement ou " all "'
                },
                required: true
            },
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
    },
    async onInteraction(interaction) {
        const amount = interaction.options.getString('amount', true);
        const member = interaction.options.getMember('member');

        const userId = interaction.user.id;

        return await handleCommand({
            guildId: interaction.guild.id,
            fromUserId: userId,
            toUserId: member?.user?.bot ? userId : member?.id,
            toUsername: member?.user?.username,
            amount,
            reply: (data) => interaction.reply(data)
        });
    },
    async onMessage(message, { args: [toUserId, amount] }) {
        const member = message.guild.members.cache.get(parseUserMention(toUserId) ?? toUserId ?? '');
        const userId = message.author.id;

        return await handleCommand({
            guildId: message.guild.id,
            fromUserId: message.author.id,
            toUserId: member?.user?.bot ? userId : member?.id,
            toUsername: member?.user?.username,
            amount,
            reply: (data) => message.reply(data)
        });
    }
});