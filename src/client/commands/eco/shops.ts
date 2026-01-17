import { Command } from '@/structures/Command'

import {
    Embed,
    Interaction,
    InteractionReplyOptions,
    InteractionUpdateOptions,
    Message,
    MessageFlags,
    Role
} from 'discord.js'

import { ContainerUI, EmbedUI } from '@/ui'
import {
    createActionRow,
    createButton,
    createMediaGallery,
    createSection,
    createSeparator,
    createStringSelectMenu,
    createTextDisplay,
    createThumbnail
} from '@/ui/components/common'

import { ShopItemModel, ShopModel } from '@/database/core/models'
import {
    shopItemService,
    memberService,
    shopService,
    guildModuleService,
    userService
} from '@/database/services'

import { escapeAllMarkdown, getDominantColor, timeElapsedFactor } from '@/utils'
import { applicationEmojiHelper } from '@/helpers'

const ITEMS_PER_PAGE = 5;

type ShopState = {
    shop: ShopModel | null;
    items: (ShopItemModel & { role: Role })[];
    page: number;
};

const buildShopSelector = ({
    guildName,
    guildIconURL,
    color,
    shops
}: {
    guildName: string;
    guildIconURL: string | null;
    color?: number;
    shops: ShopModel[];
}) => {
    const components: any[] = [];

    const header = [
        createTextDisplay(`## Boutiques de ${escapeAllMarkdown(guildName)}`),
        createTextDisplay(
            `> 💡 Une boutique vous permet d'acheter des rôles, des boosts ! `
            + `Si la boutique est ouverte, vous pouvez dépenser vos points pour acquérir les rôles disponibles :)`
        )
    ];

    if (guildIconURL) {
        components.push(
            createSection({
                accessory: createThumbnail({ url: guildIconURL }),
                components: header
            })
        );
    } else {
        components.push(...header);
    }

    if (shops.length) {
        components.push(
            createTextDisplay(`Veuillez choisir une boutique`),
            createActionRow([
                createStringSelectMenu({
                    customId: 'select_shop',
                    placeholder: 'Sélectionner une boutique',
                    options: shops.map(({ name, emoji, expiresAt }, index) => ({
                        label: name,
                        emoji: emoji ?? '🛒',
                        description: expiresAt ? `Ferme le ${expiresAt.toLocaleDateString('fr', {
                            weekday: 'long',
                            day: 'numeric',
                            hour: 'numeric',
                            month: 'long',
                            minute: '2-digit'
                        })} ⏳` : undefined,
                        value: index.toString()
                    }))
                })
            ])
        );
    } else {
        components.push(
            createTextDisplay(`***Aucune boutique est ouverte pour le moment***`)
        );
    }

    return {
        components: [ContainerUI.create({ color, components })]
    } satisfies InteractionReplyOptions;
};

const buildShopView = ({
    shop,
    items,
    page,
    totalPages,
    color,
    totalGuildPoints,
    tagRolePriceDiscount
}: {
    shop: ShopModel;
    items: (ShopItemModel & { role: Role })[];
    page: number;
    totalPages: number;
    totalGuildPoints: number;
    color?: number;
    tagRolePriceDiscount: number
}) => {
    const { yellowArrowEmoji, redArrowEmoji, whiteArrowEmoji, greenArrowEmoji } = applicationEmojiHelper();

    const components: any[] = [];

    if (shop.bannerUrl) {
        components.push(
            createMediaGallery([{ media: { url: shop.bannerUrl } }]),
        );
    }

    components.push(
        createTextDisplay(`## ${shop.emoji ?? ''} ${escapeAllMarkdown(shop.name)} — Boutique`),
    );

    if (shop.description) {
        components.push(
            createTextDisplay(`> ${shop.description}`),
        );
    }

    const showCoinCondition = items.length > 0 && items.some(({ cost }) => cost > 0);

    if (showCoinCondition || shop.expiresAt) {
        components.push(createSeparator());
    }

    if (shop.expiresAt) {
        components.push(
            createTextDisplay(`⏳ ${yellowArrowEmoji} Ferme <t:${Math.floor(new Date(shop.expiresAt).getTime() / 1000)}:R>`)
        );
    }

    if (showCoinCondition) {
        components.push(
            createTextDisplay(`:coin: Pièce de serveur total ${yellowArrowEmoji} **${totalGuildPoints.toLocaleString('en')}**`)
        )
    }

    components.push(createSeparator());

    const start = page * ITEMS_PER_PAGE;
    const pageItems = items.slice(start, start + ITEMS_PER_PAGE);

    if (pageItems.length) {
        components.push(
            createTextDisplay(
                pageItems.map(({ role, cost, stock, description }) => {
                    const lines = [`- ${role}`];

                    if (description) {
                        lines.push(`> ${description}`);
                    }

                    if (typeof stock === 'number') {
                        lines.push(
                            stock
                                ? `**↳** 📦 Stock ${greenArrowEmoji} **${stock}**`
                                : `**↳** 📦 Stock ${redArrowEmoji} **Rupture**`
                        );
                    }

                    if (cost <= 0) {
                        lines.push(`**↳** 🏷️ Prix ${whiteArrowEmoji} **GRATUIT**`);
                    } else {
                        lines.push(`**↳** 🏷️ Prix ${whiteArrowEmoji} ${shop.useTagDiscount && (tagRolePriceDiscount > 0)
                                ? `~~${cost.toLocaleString('en')}~~ **${Math.floor(cost * (1 - tagRolePriceDiscount)).toLocaleString('en')} -${(tagRolePriceDiscount * 100).toFixed(2)}%**`
                                : `**${cost.toLocaleString('en')}**`
                            }`);
                    }

                    return lines.join('\n');
                }).join('\n')
            )
        );
    } else {
        components.push(createTextDisplay(`***Aucun article à vendre pour le moment 🤠***`));
    }

    components.push(createSeparator());

    if (items.length) {
        components.push(
            createActionRow([
                createStringSelectMenu({
                    customId: 'select_item',
                    placeholder: 'Choisissez un article à acheter',
                    required: true,
                    options: pageItems
                        .filter(i => i.stock ? i.stock > 0 : true)
                        .map(({ role, roleId, cost }) => {
                            let description = undefined;

                            if (cost <= 0) {
                                description = `🏷️ GRATUIT`
                            } else {
                                description = `🏷️ ${shop.useTagDiscount && (tagRolePriceDiscount > 0)
                                        ? Math.floor(cost * (1 - tagRolePriceDiscount)).toLocaleString('en')
                                        : cost.toLocaleString('en')
                                    }`
                            }

                            return {
                                label: role.name,
                                description,
                                value: roleId
                            }
                        })
                })
            ])
        );
    }

    const navButtons = [
        createButton({
            color: 'gray',
            label: 'Retour',
            emoji: { name: '↩️' },
            customId: 'back'
        })
    ];

    if (totalPages > 1) {
        navButtons.push(
            createButton({
                color: 'gray',
                label: 'Précédent',
                emoji: { name: '⬅' },
                customId: 'page_prev',
                disabled: page === 0
            }),
            createButton({
                color: 'gray',
                label: `${page + 1} / ${totalPages}`,
                customId: '#',
                disabled: true
            }),
            createButton({
                color: 'gray',
                label: 'Suivant',
                emoji: { name: '➡' },
                customId: 'page_next',
                disabled: page + 1 >= totalPages
            })
        );
    }

    components.push(createActionRow(navButtons));

    return {
        components: [ContainerUI.create({ color, components })]
    } satisfies InteractionReplyOptions & InteractionUpdateOptions;
};

const getShops = async (guildId: string) => {
    return (await shopService.all(guildId))
        .filter(s => s.isOpen)
        .sort((a, b) => b.name.length - a.name.length);
};

export default new Command({
    nameLocalizations: {
        fr: 'boutiques'
    },
    description: '🛒 Browse and access the server shops',
    descriptionLocalizations: {
        fr: '🛒 Parcourir et accéder aux boutiques du serveur'
    },
    access: {
        guild: {
            modules: {
                eco: { isShopEnabled: true }
            }
        }
    },
    async onInteraction(interaction) {
        if (!interaction.member) return;

        const guild = interaction.guild;
        const guildIcon = guild.iconURL();
        const guildColor = guildIcon ? await getDominantColor(guildIcon) : undefined;

        const guildId = guild.id;
        const userId = interaction.user.id;

        const state: ShopState = {
            shop: null,
            items: [],
            page: 0
        };

        const buildBaseView = async () => {
            const shops = await getShops(guild.id);

            return {
                ...buildShopSelector({
                    guildName: guild.name,
                    guildIconURL: guildIcon,
                    color: guildColor,
                    shops: shops.filter(s => s.isOpen)
                })
            }
        }

        const msg = await interaction.reply({
            ...await buildBaseView(),
            flags: MessageFlags.IsComponentsV2
        });

        const collector = msg.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 60_000
        });

        const renderShop = async () => {
            if (!state.shop) return;

            state.page = Math.max(
                0,
                Math.min(
                    state.page,
                    Math.ceil(state.items.length / ITEMS_PER_PAGE) - 1
                )
            );

            const guildEcoModule = await guildModuleService.findById({
                guildId,
                moduleName: 'eco'
            });

            const userDatabase = await userService.findById(userId);
            const tagBoostPercent = timeElapsedFactor(userDatabase?.tagAssignedAt, 14) * (guildEcoModule?.settings?.tagRolePriceDiscount ?? 0)

            const totalGuildPoints = (await memberService.getTotalGuildCoins({
                userId,
                guildId
            })).total;

            return buildShopView({
                shop: state.shop,
                items: state.items,
                page: state.page,
                totalPages: Math.ceil(state.items.length / ITEMS_PER_PAGE),
                color: state.shop.color ?? guildColor,
                totalGuildPoints,
                tagRolePriceDiscount: tagBoostPercent > 0.1 ? tagBoostPercent : 0
            });
        };

        collector.on('collect', async (i) => {
            collector.resetTimer();

            const backToSelect = async () => {
                state.shop = null;
                state.items = [];
                state.page = 0;

                return await i.update({
                    flags: MessageFlags.IsComponentsV2,
                    ...await buildBaseView()
                });
            }

            if (state.shop && state.shop.expiresAt) {
                state.shop = await shopService.findById({
                    guildId,
                    name: state.shop.name
                });

                if (!state.shop || state.shop.expiresAt && (new Date() > state.shop.expiresAt)) {
                    return await backToSelect();
                }
            }

            const refreshShop = async (interactionOrMessage: Interaction | Message = i) => {
                const view = await renderShop();
                if (!view) return;

                if ('update' in interactionOrMessage) {
                    return interactionOrMessage.update({
                        flags: MessageFlags.IsComponentsV2,
                        ...view
                    });
                } else if ('edit' in interactionOrMessage) {
                    return interactionOrMessage.edit(view);
                }
            };

            if (i.isStringSelectMenu()) {
                if (i.customId === 'select_shop') {
                    const shops = await getShops(guild.id);

                    state.shop = shops[+i.values[0]];
                    state.page = 0;

                    const items = await shopItemService.all({
                        guildId: guild.id,
                        shopName: state.shop.name
                    })

                    state.items = items
                        .map((item) => ({
                            ...item,
                            role: guild.roles.cache.get(item.roleId)
                        }))
                        .filter(
                            (item): item is typeof item & { role: Role } =>
                                item.role !== undefined
                        )

                    return await refreshShop();
                }

                if (i.customId === 'select_item') {
                    const roleId = i.values[0];
                    const item = { ...(state.items.find((item) => item.roleId === roleId) ?? {}) };

                    if (!state.shop) {
                        return await i.reply({
                            flags: MessageFlags.Ephemeral,
                            embeds: [
                                EmbedUI.createErrorMessage({
                                    title: 'SH-404',
                                    description: `Une erreur est survenue lors de l'achat`
                                })
                            ]
                        });
                    }

                    if (!item || !item.roleId || !item.cost) {
                        await refreshShop();
                        return await i.followUp({
                            flags: MessageFlags.Ephemeral,
                            embeds: [
                                EmbedUI.createErrorMessage({
                                    title: 'IM-404',
                                    description: `Une erreur est survenue lors de l'achat`
                                })
                            ]
                        });
                    }

                    if (i.member.roles.cache.get(item.roleId)) {
                        await refreshShop();
                        return await i.followUp({
                            flags: MessageFlags.Ephemeral,
                            embeds: [
                                EmbedUI.createErrorMessage(`Vous possédez déjà cet article !`)
                            ]
                        });
                    }

                    const guildEcoModule = await guildModuleService.findById({
                        guildId,
                        moduleName: 'eco'
                    });

                    const tagRolePriceDiscount = guildEcoModule?.settings?.tagRolePriceDiscount ?? 0;

                    if (state.shop.useTagDiscount && tagRolePriceDiscount && (item.cost > 0)) {
                        const userDatabase = await userService.findById(userId);
                        const tagBoostPercent = timeElapsedFactor(userDatabase?.tagAssignedAt, 14) * tagRolePriceDiscount

                        if (tagBoostPercent > 0.1) {
                            item.cost = item.cost * (1 - tagBoostPercent);
                        }
                    }

                    const totalGuildPoints = (await memberService.getTotalGuildCoins({
                        userId,
                        guildId
                    })).total;

                    if (item.cost > totalGuildPoints) {
                        await refreshShop();
                        return await i.followUp({
                            flags: MessageFlags.Ephemeral,
                            embeds: [
                                EmbedUI.createErrorMessage(`Vous n'avez pas assez de pièce de serveur pour acheter cet article`)
                            ]
                        });
                    }

                    if (typeof item.stock === 'number' && item.stock <= 0) {
                        await refreshShop();
                        return await i.followUp({
                            flags: MessageFlags.Ephemeral,
                            embeds: [
                                EmbedUI.createErrorMessage(`Cet article ne possède plus de stock, merci d'attendre les restocks !`)
                            ]
                        });
                    }

                    const confirmMsg = await i.update({
                        flags: MessageFlags.IsComponentsV2,
                        allowedMentions: {
                            roles: []
                        },
                        components: [
                            ContainerUI.createMessage({
                                color: 'orange',
                                title: `Boutique - Achat`,
                                message: [
                                    item.cost <= 0
                                        ? `Souhaitez-vous acheté ${item.role} **GRATUITEMENT** ?`
                                        : `Souhaitez-vous acheté ${item.role} pour **${item.cost.toLocaleString('en')}** pièces de guilde ?`,
                                    `> 💡 Une fois acheté le rôle remplacera automatiquement le rôle précédement acheté`
                                ].join('\n'),
                                components: [
                                    createActionRow([
                                        createButton('Confirmer', { color: 'green', customId: 'confirm' }),
                                        createButton('annuler', { color: 'red', customId: 'cancel' })
                                    ])
                                ]
                            })
                        ],
                    });

                    try {
                        const confirm = await confirmMsg.awaitMessageComponent({
                            filter: (i) => i.user.id === userId,
                            time: 15_000
                        });

                        if (confirm.customId === 'cancel') {
                            return await refreshShop(confirm);
                        }

                        try {
                            if (typeof item.stock === 'number') {
                                await shopItemService.decrementStock({
                                    guildId,
                                    roleId: item.roleId,
                                    shopName: state.shop.name
                                });

                                item.stock--
                            }

                            await memberService.removeGuildCoinsWithVault({
                                userId,
                                guildId
                            }, item.cost);

                            for (const item of state.items) {
                                if (i.member.roles.cache.get(item.roleId)) {
                                    await i.member.roles.remove(item.roleId);
                                };
                            }

                            await i.member.roles.add(item.roleId);

                            await refreshShop(confirm);

                            return await confirm.followUp({
                                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                                allowedMentions: {
                                    roles: []
                                },
                                components: [
                                    ContainerUI.createSuccessMessage({
                                        title: `Boutique - Achat`,
                                        message: `Transaction réussi, vous avez acheté ${item.role} ! :)`,
                                    })
                                ],
                            });
                        } catch {
                            await refreshShop();
                            return await i.followUp({
                                flags: MessageFlags.Ephemeral,
                                embeds: [
                                    EmbedUI.createErrorMessage({
                                        title: 'T-500',
                                        description: `Une erreur est survenue lors de l'achat`
                                    })
                                ]
                            });
                        }
                    } catch {
                        return await refreshShop(confirmMsg as any);
                    }
                }
            }

            if (i.customId === 'page_next') state.page++;
            if (i.customId === 'page_prev') state.page--;

            if (i.customId === 'page_next' || i.customId === 'page_prev') {
                return await refreshShop();
            }

            if (i.customId === 'back') {
                return await backToSelect();
            }
        });

        collector.on('end', async () => {
            await interaction.editReply({
                components: [
                    ContainerUI.createMessage({
                        color: 'orange',
                        title: 'Fermeture automatique',
                        message: '**60 secondes** se sont écoulées sans interaction 💡',
                    })
                ]
            });
        });
    }
});
