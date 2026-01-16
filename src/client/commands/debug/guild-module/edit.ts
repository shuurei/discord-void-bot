import { guildModuleService } from '@/database/services'
import { defaultGuildModuleSettings } from '@/database/utils'
import { Command } from '@/structures/Command'
import { EmbedUI } from '@/ui/EmbedUI'

export default new Command({
    access: {
        user: {
            isDeveloper: true
        }
    },
    messageCommand: {
        style: 'slashCommand'
    },
    async onMessage(message, { args: [moduleName, fieldName, value] }) {
        if (!moduleName) {
            return await message.reply({
                embeds: [
                    EmbedUI.createErrorMessage(`Euh.. Je crois que tu as oublié de mettre le **nom du module** que tu veux modifier hehe..`)
                ]
            });
        }

        if (!(moduleName in defaultGuildModuleSettings)) {
            return await message.reply({
                embeds: [
                    EmbedUI.createErrorMessage(`Mhh.. Je ne trouves pas de **module** avec ce nom, êtes t'es certain d'avoir utilisé le bon nom ? 🤔`)
                ]
            });
        }

        if (!fieldName) {
            return await message.reply({
                embeds: [
                    EmbedUI.createErrorMessage(`Euh.. Je crois que tu as oublié de mettre le **nom du champ** que tu veux modifier hehe..`)
                ]
            });
        }

        if (!(fieldName in (defaultGuildModuleSettings as any)[moduleName])) {
            return await message.reply({
                embeds: [
                    EmbedUI.createErrorMessage(`Mhh.. Je ne trouves pas de **champ** avec ce nom, t'es certain d'avoir utilisé le bon nom ? 🤔`)
                ]
            });
        }

        if (!value) {
            return await message.reply({
                embeds: [
                    EmbedUI.createErrorMessage(`Je veux bien modifier le champ.. mais si j'ai pas de valeur ça va être complicado 😂`)
                ]
            });
        }

        const fieldType = typeof (defaultGuildModuleSettings as any)[moduleName][fieldName];
        let fieldValue : any = value;

        if (fieldType === 'number') {
            fieldValue = parseInt(value);
        } else if (fieldType === 'boolean') {
            fieldValue = value === 'true';
        }

        await guildModuleService.updateSettingField({
            guildId: message.guild.id,
            moduleName: moduleName as any,
        }, fieldName, fieldValue);

        return await message.reply({
            embeds: [
                EmbedUI.createSuccessMessage({
                    title: `🔍 Debug - Modification d'un champ module de serveur`,
                    description: `Eh hop, j'ai défini **\`${fieldName}\`** du module **\`${moduleName}\`** avec la valeur **\`${fieldValue}\`** !`
                })
            ]
        });
    }
});
