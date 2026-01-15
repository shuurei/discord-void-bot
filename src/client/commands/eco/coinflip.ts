import { GuildMember } from 'discord.js'
import { Command } from '@/structures/Command'

import { memberService } from '@/database/services'
import { EmbedUI } from '@/ui'

import { applicationEmojiHelper, guildMemberHelper } from '@/helpers'

const MIN_BET = 5_000;
const MAX_BET = 100_000;

const MIN_WIN = 0.1;
const MAX_WIN = 0.5;

const calculateWinChance = (amount: number) => {
    const t = (amount - MIN_BET) / (MAX_BET - MIN_BET);
    const clamped = Math.min(Math.max(t, 0), 1);

    return MAX_WIN - clamped * (MAX_WIN - MIN_WIN);
};

const handleCommand = async ({
    amount,
    guildId,
    member
}: {
    amount: number;
    guildId: string;
    member: GuildMember;
}) => {
    const helper = await guildMemberHelper(member, { fetchAll: true });

    const payload = {
        title: 'Coin Flip 🎰',
        thumbnail: { url: helper.getAvatarURL() }
    }

    if (isNaN(amount)) {
        return EmbedUI.createErrorMessage({
            ...payload,
            description: `Je ne comprends pas ce chiffre`
        });
    }

    if (amount < MIN_BET) {
        return EmbedUI.createErrorMessage({
            ...payload,
            description: `La Mise minimale est de **${MIN_BET.toLocaleString('en')}** pièces de guilde`
        });
    }

    if (amount > MAX_BET) {
        return EmbedUI.createErrorMessage({
            ...payload,
            description: `La Mise maximale est de **${MAX_BET.toLocaleString('en')}** pièces de guilde`
        });
    }

    const balance = await memberService.getTotalGuildCoins({
        guildId,
        userId: member.id
    });

    if (balance.total < amount) {
        return EmbedUI.createErrorMessage({
            ...payload,
            description: `Vous n'avez pas assez d'argent pour parier`
        });
    }

    const { greenArrowEmoji, redArrowEmoji, whiteArrowEmoji } = applicationEmojiHelper();

    const win = Math.random() < calculateWinChance(amount);

    if (win) {
        amount *= 2;

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
            `> 💸 Perte ${redArrowEmoji} **-${amount.toLocaleString('en')}** pièce de serveur`,
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
                type: 4,
                name: 'amount',
                description: 'Montant à parier',
                description_localizations: {
                    fr: 'Montant à parier'
                },
                min_value: MIN_BET,
                required: true
            }
        ]
    },
    messageCommand: {
        style: 'flat'
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
                    amount: interaction.options.getInteger('amount', true),
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
                    amount: Number(amount),
                    guildId: message.guild.id,
                    member: message.member!
                })
            ]
        });
    }
})
