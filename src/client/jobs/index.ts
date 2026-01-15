import logger from '@/utils/logger.js'

export const jobsLogger = logger.use({
    prefix: (c) => c.white(`[${c.cyanBright(`JOBS`)}] <🕛>`)
});

export const startAllJobs = async () => {
    logger.topBorderBox('jobs Loading ⏳');
    await import('./tick.js');
    await import('./weekly.js');
    logger.bottomBorderBox('✅ Jobs loaded');

    console.log();
}

export default {
    startAllJobs,
    logger
}
