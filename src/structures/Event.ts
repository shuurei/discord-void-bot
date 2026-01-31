import {
    ButtonInteraction,
    ChatInputCommandInteraction,
    ClientEvents,
    Guild,
    Message,
    User,
} from 'discord.js'

import { Command } from './Command'
import { CustomClient } from './CustomClient'
import { BlacklistModel } from '@/database/core/models'

export interface CustomClientEvents extends ClientEvents {
    chatInputInteractionCreate: [ChatInputCommandInteraction],
    buttonInteractionCreate: [ButtonInteraction],
    commandCreate: [Command, Message | ChatInputCommandInteraction, string[] | null[]],
    databaseDisconnected: [...args: any],
    databaseReady: [...args: any],
    blacklistCreate: [BlacklistModel, Guild, User, User],
    blacklistTreated: [BlacklistModel],
};

export interface EventRunOptions<Event extends keyof CustomClientEvents> {
    events: CustomClientEvents[Event];
}

export interface EventOptions<Event extends keyof CustomClientEvents> {
    name: Event;
    once?: boolean;
    run(
        this: this & { client: CustomClient; },
        options: EventRunOptions<Event>
    ): any;
}

export class Event<Event extends keyof CustomClientEvents> {
    name: Event;
    once: boolean;

    run: (options: EventRunOptions<Event>) => any;

    constructor(data: EventOptions<Event>) {
        if (typeof data.run !== 'function') {
            throw new Error('The "run" property must be a function !');
        }

        Object.assign(this, data);
    }
}

export default Event;