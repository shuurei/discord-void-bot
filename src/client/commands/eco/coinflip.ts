import { GuildMember } from 'discord.js'
import { Command } from '@/structures/Command'

import { memberService } from '@/database/services'
import { EmbedUI } from '@/ui'

import { applicationEmojiHelper, guildMemberHelper } from '@/helpers'
import { randomNumber } from '@/utils'

const MIN_BET = 500;
const MAX_BET = 50_000;

const MIN_WIN = 0.25;
const MAX_WIN = 0.45;

const handleCommand = async ({
    amount,
    guildId,
    member
}: {
    amount: number | 'max';
    guildId: string;
    member: GuildMember;
}) => {
    const helper = await guildMemberHelper(member, { fetchAll: true });

    const payload = {
        title: 'Coin Flip',
        thumbnail: { url: helper.getAvatarURL() },
        footer: { text: `⚠️ Jouez de façon responsable - Les jeux d’argent peuvent entraîner des pertes` }
    }

    const balance = await memberService.getTotalGuildCoins({
        guildId,
        userId: member.id
    });


    if (typeof amount === 'string' && amount === 'max') {
        amount = Math.min(balance.total, MAX_BET);
    }

    amount = +amount;

    if (isNaN(amount)) {
        return EmbedUI.createErrorMessage({
            ...payload,
            description: `Je ne comprends pas ce chiffre`
        });
    }

    if (amount < MIN_BET) {
        return EmbedUI.createErrorMessage({
            ...payload,
            thumbnail: undefined,
            description: `La Mise minimale est de **${MIN_BET.toLocaleString('en')}** pièces de serveur`
        });
    }

    if (amount > MAX_BET) {
        return EmbedUI.createErrorMessage({
            ...payload,
                thumbnail: undefined,
            description: `La Mise maximale est de **${MAX_BET.toLocaleString('en')}** pièces de serveur`
        });
    }

    if (balance.total < amount) {
        return EmbedUI.createErrorMessage({
            ...payload,
            thumbnail: undefined,
            description: `Vous n'avez pas assez d'argent pour parier`
        });
    }

    const { greenArrowEmoji, redArrowEmoji, whiteArrowEmoji } = applicationEmojiHelper();

    const win = Math.random() < randomNumber(MIN_WIN, MAX_WIN, true);

    if (win) {
        await memberService.addGuildCoins({ guildId, userId: member.id }, amount);

        return EmbedUI.create({
            ...payload,
            color: 'green',
            description: [
                `Vous avez doublé votre mise ! 🔥`,
                `> 💰 Gain ${greenArrowEmoji} **+${amount.toLocaleString('en')}** pièce de serveur`,
                `> :coin: Total d'argent ${whiteArrowEmoji} **${(balance.total + amount).toLocaleString('en')}** pièce de serveur`
            ].join('\n')
        });
    }

    await memberService.removeGuildCoinsWithVault({ guildId, userId: member.id }, amount);

    return EmbedUI.create({
        ...payload,
        color: 'red',
        description: [
            `La chance n'étais pas du bon côté.. 💀`,
            `> 💸 Perte ${redArrowEmoji} **-${(amount).toLocaleString('en')}** pièce de serveur`,
            `> :coin: Total d'argent ${whiteArrowEmoji} **${(balance.total - amount).toLocaleString('en')}** pièce de serveur`
        ].join('\n')
    });
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
                description: 'The amount to wager or "max "',
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
        return await interaction.reply({
            embeds: [
                await handleCommand({
                    amount: interaction.options.getString('amount', true) as 'max',
                    guildId: interaction.guild.id,
                    member: interaction.member
                })
            ]
        });
    },
    async onMessage(message, { args: [amount] }) {
        return await message.reply({
            embeds: [
                await handleCommand({
                    amount: amount as 'max',
                    guildId: message.guild.id,
                    member: message.member!
                })
            ]
        });
    }
})
