import fg from 'fast-glob'
import { pathToFileURL } from 'url'
import {
    Collection,
    SlashCommandBuilder,
    SlashCommandSubcommandGroupBuilder,
    RESTPostAPIApplicationCommandsJSONBody,
    APIApplicationCommandSubcommandGroupOption,
    APIApplicationCommandSubcommandOption,
    ApplicationCommandOptionType,
} from 'discord.js'

import {
    CustomClient,
    Command,
    CommandStructure,
    MessageCommandStyle
} from '@/structures'
import { logger, cache } from '@/utils'

export interface LoadCommandManagerOptions {
    directory: string;
}

export interface CommandManagerResolveSlashCommandOptions {
    commandName: string;
    subcommandGroupName?: string | null;
    subcommandName?: string | null;
}

export class CommandManager {
    client: CustomClient;

    private _commands: Command[];

    constructor(client: CustomClient) {
        this.client = client;
        this._commands = [];
    }

    get all() {
        return this._commands;
    }

    get unrestrictedCommands() {
        return this._commands.filter((cmd) => !cmd.access?.guild?.authorizedIds?.length);
    }

    get restrictedCommands() {
        return this._commands.filter((cmd) => cmd.access?.guild?.authorizedIds?.length);
    }

    get slashCommands() {
        return this._commands.filter((cmd) => cmd.onInteraction && cmd.structure.interaction);
    }

    get unrestrictedSlashCommands() {
        return this.unrestrictedCommands.filter((cmd) => cmd.onInteraction && cmd.structure.interaction);
    }

    get restrictedSlashCommands() {
        return this.restrictedCommands.filter((cmd) => cmd.onInteraction && cmd.structure.interaction);
    }

    get messageCommands() {
        return this._commands.filter((cmd) => cmd.onMessage);
    }

    get unrestrictedMessageCommands() {
        return this.unrestrictedCommands.filter((cmd) => cmd.onMessage);
    }

    get restrictedMessageCommands() {
        return this.restrictedCommands.filter((cmd) => cmd.onMessage);
    }

    async load(options: LoadCommandManagerOptions) {
        const cwd = './src/client/';
        const path = options.directory.concat('/**/*.{ts,js}');

        logger.topBorderBox('Commands Loading ⏳');

        const files = await fg(path, { cwd });
        for (const filePath of files) {
            const mod = (await import(pathToFileURL(`${cwd}/${filePath}`).href))?.default;
            if (!(mod instanceof Command)) continue;

            const groupRegex = /^\(.+\)$/;
            const parts = filePath
                .replace(/\.(ts|js)$/, '')
                .split('/')
                .slice(1)
                .filter((p) => !groupRegex.test(p));

            if (parts.length < 1) continue;

            let interactionStructure: Partial<CommandStructure['interaction']> = {};
            let messageStructure: Partial<CommandStructure['message']> = {};

            let fileName = parts.pop() as string;

            const isIndexCommand = fileName.toLowerCase() === 'index';

            if (isIndexCommand && parts.length > 1) {
                fileName = parts.pop() as string;
            }

            if (mod.onInteraction) {
                const lastParts = parts.slice(-2);

                if (lastParts.length === 2) {
                    interactionStructure = {
                        subcommandGroupName: lastParts[1],
                        subcommandName: fileName,
                        commandName: lastParts[0],
                    };
                } else if (lastParts.length === 1) {
                    interactionStructure = {
                        commandName: parts[0],
                        subcommandName: fileName,
                    }
                } else {
                    interactionStructure.commandName = fileName
                }

                mod.structure.interaction = interactionStructure as CommandStructure['interaction'];
            }

            if (mod.onMessage) {
                messageStructure = {
                    commandName: fileName,
                    parts,
                };

                mod.structure.message = messageStructure as CommandStructure['message'];
            }

            this._commands.push(mod);
        }

        if (this.slashCommands.length > 0) {
            logger.borderBox(`🌐 Slash Commands (${this.slashCommands.length})`);
            for (const cmd of this.slashCommands) {
                logger.borderBox((c) => `${c.cyan('⤷')} ${c.cyanBright(cmd.name)}`)
            }
        }

        if (this.messageCommands.length > 0) {
            logger.borderBox(`💬 Message Commands (${this.messageCommands.length})`);
            for (const cmd of this.messageCommands) {
                logger.borderBox((c) => `${c.cyan('⤷')} ${c.cyanBright(cmd.name)}`)
            }
        }

        logger.bottomBorderBox('✅ Commands loaded');
        console.log();
    }

    async syncSlashCommands() {
        if (!this.client.application) {
            throw new Error('Client application is not ready.');
        }

        const sortCommands = (data: any) => {
            return data
                .map((cmd: any) => ({
                    ...cmd,
                    options: cmd.options ? sortCommands(cmd.options as any) : undefined
                }))
                .sort((a: any, b: any) => {
                    if (a.required && !b.required) return -1;
                    if (!a.required && b.required) return 1;
                    
                    if (!([1, 2].includes(a.type) && [1, 2].includes(b.type))) {                        
                        return 0;
                    }

                    return a.name.localeCompare(b.name);
                })
        };

        logger.topBorderBox('Sync Slash Commands ⏳');

        let unrestrictedSlashCommandsData: RESTPostAPIApplicationCommandsJSONBody[] = [];
        let restrictedSlashCommandsData = new Collection<string, RESTPostAPIApplicationCommandsJSONBody[]>();

        const addOrUpdateCommand = (
            commandsData: RESTPostAPIApplicationCommandsJSONBody[],
            command: Command,
            commandName: string,
            subcommandGroupName?: string | null,
            subcommandName?: string | null
        ) => {
            if (subcommandName) {
                let cmd = commandsData.find((cmd) => cmd.name === commandName);
                if (!cmd) {
                    cmd = new SlashCommandBuilder()
                        .setName(commandName)
                        .setDescription(commandName)
                        .toJSON();
                    commandsData.push(cmd);
                }

                const sub = {
                    type: ApplicationCommandOptionType.Subcommand,
                    ...command.toAPI(),
                } as APIApplicationCommandSubcommandOption;

                if (subcommandGroupName) {
                    let group = cmd.options?.find((opt) => opt.name === subcommandGroupName) as APIApplicationCommandSubcommandGroupOption;
                    if (!group) {
                        group = {
                            ...new SlashCommandSubcommandGroupBuilder()
                                .setName(subcommandGroupName)
                                .setDescription(subcommandGroupName)
                                .toJSON(),
                        };
                        cmd.options?.push(group);
                    }

                    group.options!.push(sub);
                } else {
                    cmd.options?.push(sub);
                }
            } else {
                commandsData.push(command.toAPI());
            }
        };

        const buildSlashCommandData = (command: Command) => {
            const { commandName, subcommandGroupName, subcommandName } = command.structure.interaction!;
            if (!commandName) return;

            const guildIds = command.access?.guild?.authorizedIds;

            if (!guildIds || !guildIds.length) {
                addOrUpdateCommand(unrestrictedSlashCommandsData, command, commandName, subcommandGroupName, subcommandName);
            } else {
                guildIds.forEach((guildId) => {
                    if (!restrictedSlashCommandsData.has(guildId)) {
                        restrictedSlashCommandsData.set(guildId, []);
                    }
                    addOrUpdateCommand(restrictedSlashCommandsData.get(guildId)!, command, commandName, subcommandGroupName, subcommandName);
                });
            }
        };

        this.restrictedSlashCommands.forEach(buildSlashCommandData);
        this.unrestrictedSlashCommands.forEach(buildSlashCommandData);

        try {
            let commandsCache = cache.read<any>('commands');

            const sortedUnrestricted = sortCommands(unrestrictedSlashCommandsData);
            if (
                !commandsCache
                || JSON.stringify(commandsCache.unrestrictedSlashCommandsData) !== JSON.stringify(sortedUnrestricted)
            ) {
                logger.borderBox(`🔁 » Refreshing ${sortedUnrestricted.length} unrestricted slash commands..`);
                await this.client.application.commands.set(sortedUnrestricted);
                commandsCache = cache.write('commands', { ...commandsCache, unrestrictedSlashCommandsData: sortedUnrestricted });
            }

            for (const [guildId, commands] of restrictedSlashCommandsData.entries()) {
                const sortedCommands = sortCommands(commands);
                if (
                    !commandsCache
                    || JSON.stringify(commandsCache.restrictedSlashCommandsData?.[guildId as any]) !== JSON.stringify(sortedCommands)
                ) {
                    logger.borderBox(`🔁 » Refreshing restricted slash commands for guild ${guildId}..`);
                    await this.client.application.commands.set(commands, guildId);
                    commandsCache = cache.write('commands', {
                        ...commandsCache,
                        restrictedSlashCommandsData: {
                            ...commandsCache?.restrictedSlashCommandsData,
                            [guildId]: sortedCommands 
                        }
                    });
                }
            }

            const outdatedRestrictedCommands = Object
                .keys(commandsCache?.restrictedSlashCommandsData ?? {})
                .filter((guildId) => !restrictedSlashCommandsData.has(guildId));

            for (const guildId of outdatedRestrictedCommands) {
                logger.borderBox(`🗑️ » Removing restricted slash commands for guild ${guildId}`);
                await this.client.application.commands.set([], guildId);

                const clearCommands = Object.fromEntries(
                    Object
                        .entries(commandsCache.restrictedSlashCommandsData)
                        .filter(([k, v]) => k !== guildId)
                        .map(([k, v]) => [k, v])
                );

                delete commandsCache.restrictedSlashCommandsData?.[guildId];
                cache.write('commands', {
                    ...commandsCache,
                    restrictedSlashCommandsData: clearCommands,
                });
            }

            logger.bottomBorderBox('✅ » Sync completed successfully !');
        } catch (err) {
            logger.bottomBorderBox(`❌ » Sync failed: ${err}`);
        }

        console.log();
    }

    resolveSlashCommand(options: CommandManagerResolveSlashCommandOptions): Command | undefined {
        return this.slashCommands.find(({ structure }) => {
            if (!structure.interaction) return;

            const { subcommandName, subcommandGroupName, commandName } = options;

            if (subcommandGroupName) return structure.interaction.commandName === commandName
                && structure.interaction?.subcommandGroupName === subcommandGroupName
                && structure.interaction?.subcommandName === subcommandName;

            if (subcommandName) return structure.interaction.commandName === commandName
                && structure.interaction?.subcommandName === subcommandName;

            return structure.interaction.commandName === commandName;
        });
    }

    resolveMessageCommand(parts: string[]): Command | undefined {
        return this.messageCommands.find((cmd) => {
            const isSlashCommandStyle = cmd.messageCommand.style === MessageCommandStyle.SLASH_COMMAND;

            const commandParts = isSlashCommandStyle
                ? cmd.structure.message?.parts ?? []
                : [];

            if (isSlashCommandStyle) {
                const matchesParts = commandParts.every((part, i) => parts[i] === part);
                if (!matchesParts) return false;
            }

            const remainingArgs = parts.slice(commandParts.length);

            const invokedName = remainingArgs.shift();
            if (!invokedName) return false;

            const matchesCommand = invokedName === (cmd?.messageCommand?.name ?? cmd.structure?.message?.commandName)
                || cmd.messageCommand.aliases?.includes(invokedName);

            if (matchesCommand) return true;

            return false;
        });
    }
}