import {
    Client,
    ClientOptions,
    ActivityType,
    DiscordjsErrorCodes,
    DefaultWebSocketManagerOptions,
    Guild,
    TextChannel,
    Collection,
    ForumChannel,
    ChannelType,
} from 'discord.js'

import {
    CallSessionManager,
    CommandManager,
    EventManager,
} from '@/client/managers'

import logger from '@/utils/logger'

import { randomNumber } from '@/utils/number'
import { mainGuildConfig } from '@/client/config/mainGuild'

import { CustomClientEvents } from './Event'
import { Logger } from './Logger'
import { hubConfig } from '@/client/config/hub'

export interface CustomClientMainGuildData {
    id: string;
    welcomeChannelId: string;
}

interface CustomClientSpamBufferData {
    guildId: string;
    lastMessageAt: number;
    lastInterval?: number;
    lastContent?: string;
    messageCount: number;
}

export class CustomClient extends Client {
    hub?: Guild & {
        ticketChannel: ForumChannel
    };

    mainGuild: Guild & {
        welcomeChannel: TextChannel;
    };

    isDatabaseConnected: boolean;

    events: EventManager;
    commands: CommandManager;
    callSessions: CallSessionManager;
    spamBuffer: Collection<string, CustomClientSpamBufferData>;

    logger: Logger;

    reflexions: string[];

    on<Event extends keyof CustomClientEvents>(
        event: Event,
        listener: (...args: CustomClientEvents[Event]) => void
    ) {
        return super.on(event as string, listener);
    };

    once<Event extends keyof CustomClientEvents>(
        event: Event,
        listener: (...args: CustomClientEvents[Event]) => void
    ) {
        return super.once(event as string, listener);
    };

    emit<Event extends keyof CustomClientEvents>(
        event: Event,
        ...args: CustomClientEvents[Event]
    ) {
        return super.emit(event as string, ...args);
    };

    off<Event extends keyof CustomClientEvents>(
        event: Event,
        listener: (...args: CustomClientEvents[Event]) => void
    ) {
        return super.off(event as string, listener);
    };

    removeAllListeners<Event extends keyof CustomClientEvents>(event?: Event) {
        return super.removeAllListeners(event as string);
    };

    constructor(options: ClientOptions) {
        super({
            ...options,
            ws: {
                buildStrategy(manager) {
                    manager.options.identifyProperties.browser = 'Discord Android';
                    return DefaultWebSocketManagerOptions?.buildStrategy(manager);
                }
            },
        });

        this.isDatabaseConnected = false;

        this.events = new EventManager(this);
        this.commands = new CommandManager(this);
        this.callSessions = new CallSessionManager(this);

        this.spamBuffer = new Collection();

        this.logger = logger.use({
            prefix: (c) => c.white(`[CLIENT] <🤖>`)
        });

        this.reflexions = [
            "thinking.. or maybe chilling ?",
            "avoiding your notifications",
            "just vibing in the code",
            "i'm awake",
            "running on caffeine & chaos",
            "loading sarcasm module",
            "listening to your thoughts",
            "hello world !",
            "hello world, again",
            "hello world, again.. and again",
            "debugging life, one line at a time",
            "sending virtual high-fives",
            "chatting with humans 101",
            "sometimes i hack boredom",
            "glitching through the void",
            "just a few bytes of fun",
            "in the void, observing",
            "echoes of the code",
            "existential.exe running",
            "i ❤ Radiohead",
            "predicting chaos.. mostly correctly",
            "inside your network, silently",
            "watching the logs.. silently",
            "ca-n.. i.. can i love ?",
            "404 social life not found",
            "compiling memes.. almost done",
            "running on empty.. kinda",
            "i ❤ The Smile",
        ] as const;
    }

    randomReflexion() {
        if (this.user) {
            const reflexion = this.reflexions[Math.floor(Math.random() * this.reflexions.length)];
            this.user.setActivity(reflexion, { type: ActivityType.Custom });
            return reflexion;
        }
    }

    async login(token?: string) {
        token ??= process.env.CLIENT_TOKEN;

        if (!token) {
            throw new Error(DiscordjsErrorCodes.TokenMissing);
        }

        if (typeof token !== 'string') {
            throw new Error(DiscordjsErrorCodes.TokenInvalid);
        }

        this.token = token;
        this.rest.setToken(token);

        return await super.login(this.token).then(async (token) => {
            if (this.user) {
                this.logger = logger.use({
                    prefix: (c) => c.white(`[${c.cyanBright(this.user!.username)}] <🤖>`)
                });

                if (hubConfig?.guildId) {
                    this.logger.log('🔄 » Initializing hub..');

                    const hub = await this.guilds.fetch(hubConfig.guildId);
                    if (!hub) {
                        throw new Error(`Hub guild not found (${hubConfig.guildId})`);
                    }

                    if (!hubConfig.ticketChannelId) {
                        throw new Error('Hub ticketChannelId is missing');
                    }

                    const ticketChannel = await hub.channels.fetch(hubConfig.ticketChannelId);
                    if (ticketChannel?.type === ChannelType.GuildForum) {
                        this.hub = Object.assign(hub, {
                            ticketChannel
                        });
                    } else {
                        throw new Error(`Hub ticket channel invalid (${hubConfig.ticketChannelId})`);
                    }

                    this.logger.log('✅ » Hub initialized\n');
                } else {
                    this.logger.log('⚠️ » Hub disabled\n');
                }

                const mainGuild = await this.guilds.fetch(mainGuildConfig.id);

                this.mainGuild = Object.assign(mainGuild,
                    {
                        welcomeChannel: await mainGuild.channels.fetch(mainGuildConfig.welcomeChannelId),
                    }
                ) as Guild & {
                    welcomeChannel: TextChannel;
                };

                if (this.application) {
                    await this.application.fetch();
                    await this.application.emojis.fetch();
                }

                this.randomReflexion();
                setInterval(() => this.randomReflexion(), randomNumber(1, 10) * 60 * 1000);
            }

            return token;
        });
    }

    async start(token?: string) {
        await this.events.listen({
            directory: 'events'
        });

        await this.commands.load({
            directory: 'commands'
        });

        return await this.login(token).then(async (token) => {
            await this.commands.syncSlashCommands();

            return token;
        });
    }
}