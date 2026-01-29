import { GuildMember, MessageFlags } from 'discord.js'
import { Command } from '@/structures/Command'

import { memberService } from '@/database/services'

import { randomNumber } from '@/utils'
import { createNotifCard } from '@/ui/assets/cards/notifCard'
import { createMediaGallery } from '@/ui/components/common'

const MIN_BET = 200;
const MAX_BET = 75_000;

const MIN_WIN = 0.4;
const MAX_WIN = 0.5;

const handleCommand = async ({
    amount,
    guildId,
    member
}: {
    amount: number | 'max';
    guildId: string;
    member: GuildMember;
}) => {
    const balance = await memberService.getTotalGuildCoins({
        guildId,
        userId: member.id
    });

    if (typeof amount === 'string' && amount === 'max') {
        amount = Math.min(balance.total, MAX_BET);
    }

    amount = +amount;

    if (isNaN(amount)) {
        return [
            {
                attachment: await createNotifCard({
                    text: "[Chiffre invalide.]",
                    theme: 'red'
                }),
                name: 'failure.png'
            }
        ];
    }

    if (amount < MIN_BET) {
        return [
            {
                attachment: await createNotifCard({
                    text: `[La Mise minimale est de ${MIN_BET.toLocaleString('en')} pièces.]`,
                    theme: 'red'
                }),
                name: 'failure.png'
            }
        ];
    }

    if (amount > MAX_BET) {
        return [
            {
                attachment: await createNotifCard({
                    text: `[La Mise maximale est de ${MAX_BET.toLocaleString('en')} pièces.]`,
                    theme: 'red'
                }),
                name: 'failure.png'
            }
        ];
    }

    if (balance.total < amount) {
        return [
            {
                attachment: await createNotifCard({
                    text: `[Vous n'avez pas assez d'argent pour parier.]`,
                    theme: 'red'
                }),
                name: 'failure.png'
            }
        ];
    }

    const win = Math.random() < randomNumber(MIN_WIN, MAX_WIN, true);

    if (win) {
        await memberService.addGuildCoins({ guildId, userId: member.id }, amount);

        return [
            {
                attachment: await createNotifCard({
                    text: `[Vous avez doublé votre mise. Vous avez gagné ${amount.toLocaleString('en')} de pièces.]`,
                    theme: 'green'
                }),
                name: 'success.png'
            },
            {
                attachment: await createNotifCard({
                    text: `[Nouveau solde : ${(balance.total + amount).toLocaleString('en')} pièces.]`,
                }),
                name: 'newBalance.png'
            }
        ];
    }

    await memberService.removeGuildCoinsWithVault({ guildId, userId: member.id }, amount);

    return [
        {
            attachment: await createNotifCard({
                text: `[Vous avez perdu votre mise. Vous avez perdu ${amount.toLocaleString('en')} de pièces.]`,
                theme: 'red'
            }),
            name: 'failure.png'
        },
        {
            attachment: await createNotifCard({
                text: `[Nouveau solde : ${(balance.total - amount).toLocaleString('en')} pièces.]`,
            }),
            name: 'newBalance.png'
        }
    ];
}

export default new Command({
    description: '🎰 Execute a coin flip to wager guild coins',
    descriptionLocalizations: {
        fr: '🎰 Lancez une pièce pour miser des pièces du serveur'
    },
    slashCommand: {
        arguments: [
            {
                type: 3,
                name: 'amount',
                description: 'The amount to wager or " max "',
                description_localizations: {
                    fr: 'Le montant à miser ou " max "'
                },
                required: true
            }
        ]
    },
    messageCommand: {
        style: 'flat',
    },
    access: {
        guild: {
            modules: {
                eco: {
                    isGamblingEnabled: true
                }
            }
        }
    },
    async onInteraction(interaction) {
        const files = await handleCommand({
            amount: interaction.options.getString('amount', true) as 'max',
            guildId: interaction.guild.id,
            member: interaction.member
        });

        return await interaction.reply({
            flags: MessageFlags.IsComponentsV2,
            files,
            components: files.map((file) => {
                return createMediaGallery([{ media: { url: `attachment://${file.name}` } }])
            })
        });
    },
    async onMessage(message, { args: [amount] }) {
        const files = await handleCommand({
            amount: amount as 'max',
            guildId: message.guild.id,
            member: message.member!
        });

        return await message.reply({
            flags: MessageFlags.IsComponentsV2,
            files,
            components: files.map((file) => {
                return createMediaGallery([{ media: { url: `attachment://${file.name}` } }])
            })
        });
    }
})
