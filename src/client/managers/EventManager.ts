import fg from 'fast-glob'
import { pathToFileURL } from 'url'

import logger from '@/utils/logger'
import { CustomClient, Event } from '@/structures'

export interface LoadEventManagerOptions {
    directory: string;
}

export class EventManager {
    client: CustomClient;
    
    constructor(client: CustomClient) {
        this.client = client;
    }

    async listen(options: LoadEventManagerOptions) {
        const cwd = './src/client';
        const path = options.directory.concat('/**/*.{ts,js}');

        logger.topBorderBox('Events Loading ⏳');

        const files = await fg(path, { cwd });
        for (const filePath of files) {
            const mod = (await import(pathToFileURL(`${cwd}/${filePath}`).href))?.default;
            if (!(mod instanceof Event) || !mod.name) continue;

            const listenerType = mod.once ? 'once' : 'on';

            this.client[listenerType](mod.name, async (...args) => {
                try {
                    const newThis = Object.assign(mod, {
                        client: this.client
                    });
    
                    return await mod.run.call(newThis, { events: args });
                } catch (ex) {
                    logger.error(ex);
                }
            });

            logger.borderBox((c) => `⚡ ${c.yellowBright('»')} ${c.cyanBright(mod.name)}`)
        }

        logger.bottomBorderBox('✅ Events loaded');
        console.log();
    }
}
